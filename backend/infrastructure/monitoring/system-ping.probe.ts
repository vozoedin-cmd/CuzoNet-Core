import { execFile } from 'node:child_process';

import type {
  PingProbe,
  PingProbeErrorType,
  PingProbeOptions,
  PingProbeResult,
} from '../../application/ports/monitoring/ping-probe.port.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

const maximumOutputBytes = 64 * 1024;

export interface PingCommandError {
  code?: string | number | null;
  killed: boolean;
  signal?: string | null;
}

export interface PingCommandResult {
  error?: PingCommandError;
  stderr: string;
  stdout: string;
}

export interface PingCommandRunner {
  execute(command: string, args: readonly string[], timeoutMs: number): Promise<PingCommandResult>;
}

export interface SystemPingProbeOptions {
  platform?: NodeJS.Platform;
  runner?: PingCommandRunner;
}

interface ParsedPingOutput {
  latencyMs?: number;
  packetLossPercent?: number;
}

export class SystemPingProbe implements PingProbe {
  private readonly platform: NodeJS.Platform;
  private readonly runner: PingCommandRunner;

  public constructor(options: SystemPingProbeOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runner ?? systemPingCommandRunner;
  }

  public async probe(host: string, options: PingProbeOptions): Promise<PingProbeResult> {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      return failedResult('execution');
    }

    let normalizedHost: string;
    try {
      normalizedHost = ManagementHost.create(host).value;
    } catch {
      return failedResult('execution');
    }

    const command = this.commandFor(normalizedHost, options.timeoutMs);
    if (command === null) return failedResult('execution');

    const result = await this.runner.execute('ping', command, options.timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    const parsed =
      this.platform === 'win32' ? parseWindowsPingOutput(output) : parseLinuxPingOutput(output);

    if (
      result.error === undefined &&
      parsed.latencyMs !== undefined &&
      parsed.packetLossPercent === 0
    ) {
      return {
        latencyMs: parsed.latencyMs,
        packetLossPercent: 0,
        reachable: true,
      };
    }

    return {
      errorType: classifyFailure(output, result.error),
      packetLossPercent: parsed.packetLossPercent ?? 100,
      reachable: false,
    };
  }

  private commandFor(host: string, timeoutMs: number): readonly string[] | null {
    if (this.platform === 'win32') {
      return ['-n', '1', '-w', timeoutMs.toString(), host];
    }
    if (this.platform === 'linux') {
      return ['-n', '-c', '1', '-W', Math.ceil(timeoutMs / 1_000).toString(), host];
    }
    return null;
  }
}

export function parseWindowsPingOutput(output: string): ParsedPingOutput {
  return {
    ...parsePacketLoss(output),
    ...parseLatency(output, /(?:time|tiempo)\s*([=<])\s*(\d+(?:[.,]\d+)?)\s*ms/i),
  };
}

export function parseLinuxPingOutput(output: string): ParsedPingOutput {
  const directLatency = parseLatency(output, /\btime\s*([=<])\s*(\d+(?:[.,]\d+)?)\s*ms/i);
  if (directLatency.latencyMs !== undefined) {
    return { ...parsePacketLoss(output), ...directLatency };
  }

  const averageMatch = output.match(
    /(?:rtt|round-trip)[^=]*=\s*[\d.,]+\/([\d.,]+)\/[\d.,]+\/[\d.,]+\s*ms/i,
  );
  return {
    ...parsePacketLoss(output),
    ...(averageMatch?.[1] === undefined ? {} : { latencyMs: parseDecimal(averageMatch[1]) }),
  };
}

const systemPingCommandRunner: PingCommandRunner = {
  execute(command, args, timeoutMs) {
    return new Promise((resolve) => {
      execFile(
        command,
        [...args],
        {
          encoding: 'utf8',
          maxBuffer: maximumOutputBytes,
          shell: false,
          timeout: timeoutMs,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          resolve({
            ...(error === null ? {} : { error: toCommandError(error) }),
            stderr,
            stdout,
          });
        },
      );
    });
  },
};

function parseLatency(output: string, pattern: RegExp): Pick<ParsedPingOutput, 'latencyMs'> {
  const match = output.match(pattern);
  if (match?.[2] === undefined) return {};
  return { latencyMs: parseDecimal(match[2]) };
}

function parsePacketLoss(output: string): Pick<ParsedPingOutput, 'packetLossPercent'> {
  const match =
    output.match(/(\d+(?:[.,]\d+)?)%\s*(?:packet\s+loss|loss|perdidos?)/i) ??
    output.match(/\((\d+(?:[.,]\d+)?)%[^)]*\)/);
  if (match?.[1] === undefined) return {};
  return { packetLossPercent: parseDecimal(match[1]) };
}

function parseDecimal(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

function classifyFailure(output: string, error: PingCommandError | undefined): PingProbeErrorType {
  const normalized = output.toLowerCase();
  if (
    includesAny(normalized, [
      'could not find host',
      'unknown host',
      'name or service not known',
      'temporary failure in name resolution',
      'no such host',
      'no se pudo encontrar el host',
    ])
  ) {
    return 'dns';
  }
  if (
    includesAny(normalized, [
      'destination host unreachable',
      'destination net unreachable',
      'network is unreachable',
      'general failure',
      'host de destino inaccesible',
      'red de destino inaccesible',
    ])
  ) {
    return 'unreachable';
  }
  if (
    error?.killed === true ||
    includesAny(normalized, [
      'request timed out',
      'tiempo de espera agotado',
      '100% packet loss',
      '100% loss',
      '100% perdidos',
    ])
  ) {
    return 'timeout';
  }
  return 'execution';
}

function includesAny(value: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function failedResult(errorType: PingProbeErrorType): PingProbeResult {
  return { errorType, packetLossPercent: 100, reachable: false };
}

function toCommandError(error: {
  code?: string | number | null | undefined;
  killed?: boolean | undefined;
  signal?: string | null | undefined;
}): PingCommandError {
  return {
    ...(error.code === undefined ? {} : { code: error.code }),
    killed: error.killed ?? false,
    ...(error.signal === undefined ? {} : { signal: error.signal }),
  };
}
