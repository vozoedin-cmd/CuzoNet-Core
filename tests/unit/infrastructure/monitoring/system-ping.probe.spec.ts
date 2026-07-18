import { describe, expect, it, vi } from 'vitest';

import type {
  PingCommandResult,
  PingCommandRunner,
} from '../../../../backend/infrastructure/monitoring/system-ping.probe.js';
import {
  parseLinuxPingOutput,
  parseWindowsPingOutput,
  SystemPingProbe,
} from '../../../../backend/infrastructure/monitoring/system-ping.probe.js';

describe('SystemPingProbe', () => {
  it('parsea Windows y ejecuta una sola petición con timeout en milisegundos', async () => {
    const runner = fakeRunner({
      stderr: '',
      stdout: `
        Pinging 192.0.2.10 with 32 bytes of data:
        Reply from 192.0.2.10: bytes=32 time=12ms TTL=64
        Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
      `,
    });
    const probe = new SystemPingProbe({ platform: 'win32', runner });

    await expect(probe.probe('192.0.2.10', { timeoutMs: 1_500 })).resolves.toEqual({
      latencyMs: 12,
      packetLossPercent: 0,
      reachable: true,
    });
    expect(runner.execute).toHaveBeenCalledWith(
      'ping',
      ['-n', '1', '-w', '1500', '192.0.2.10'],
      1_500,
    );
  });

  it('parsea Linux y limita la ejecución a un paquete', async () => {
    const runner = fakeRunner({
      stderr: '',
      stdout: `
        64 bytes from router.example.com: icmp_seq=1 ttl=64 time=0.347 ms
        1 packets transmitted, 1 received, 0% packet loss, time 0ms
        rtt min/avg/max/mdev = 0.347/0.347/0.347/0.000 ms
      `,
    });
    const probe = new SystemPingProbe({ platform: 'linux', runner });

    await expect(probe.probe('Router.EXAMPLE.COM', { timeoutMs: 1_500 })).resolves.toEqual({
      latencyMs: 0.347,
      packetLossPercent: 0,
      reachable: true,
    });
    expect(runner.execute).toHaveBeenCalledWith(
      'ping',
      ['-n', '-c', '1', '-W', '2', 'router.example.com'],
      1_500,
    );
  });

  it.each([
    [
      'timeout',
      {
        error: { killed: true },
        stderr: '',
        stdout: 'Request timed out. Lost = 1 (100% loss)',
      },
      'timeout',
    ],
    [
      'DNS',
      {
        error: { code: 2, killed: false },
        stderr: 'ping: missing.example: Name or service not known',
        stdout: '',
      },
      'dns',
    ],
    [
      'host inaccesible',
      {
        error: { code: 1, killed: false },
        stderr: '',
        stdout: 'Destination Host Unreachable. 100% packet loss',
      },
      'unreachable',
    ],
    [
      'fallo de proceso',
      {
        error: { code: 'ENOENT', killed: false },
        stderr: '',
        stdout: '',
      },
      'execution',
    ],
  ])('clasifica %s', async (_case, commandResult, errorType) => {
    const probe = new SystemPingProbe({
      platform: 'linux',
      runner: fakeRunner(commandResult),
    });

    await expect(probe.probe('192.0.2.10', { timeoutMs: 1_000 })).resolves.toEqual({
      errorType,
      packetLossPercent: 100,
      reachable: false,
    });
  });

  it('rechaza un host inválido sin ejecutar procesos', async () => {
    const runner = fakeRunner({ stderr: '', stdout: '' });
    const probe = new SystemPingProbe({ platform: 'linux', runner });

    await expect(probe.probe('router.example.com;whoami', { timeoutMs: 1_000 })).resolves.toEqual({
      errorType: 'execution',
      packetLossPercent: 100,
      reachable: false,
    });
    expect(runner.execute).not.toHaveBeenCalled();
  });
});

describe('ping output parsers', () => {
  it('parsea RTT menor que 1 ms y pérdida de Windows', () => {
    expect(parseWindowsPingOutput('Reply from ::1: time<1ms TTL=128\nLost = 0 (0% loss)')).toEqual({
      latencyMs: 1,
      packetLossPercent: 0,
    });
  });

  it('usa el promedio de Linux cuando falta la línea de respuesta', () => {
    expect(
      parseLinuxPingOutput(
        '1 packets transmitted, 1 received, 0% packet loss\nrtt min/avg/max/mdev = 1.1/2.2/3.3/0.1 ms',
      ),
    ).toEqual({ latencyMs: 2.2, packetLossPercent: 0 });
  });
});

function fakeRunner(result: PingCommandResult): PingCommandRunner {
  return {
    execute: vi.fn().mockResolvedValue(result),
  };
}
