import { describe, expect, it, vi } from 'vitest';

import type { RouterOsCredentials } from '../../../../backend/application/ports/monitoring/routeros-credential-provider.port.js';
import type {
  RouterOsLibraryClient,
  RouterOsLibraryClientFactory,
} from '../../../../backend/infrastructure/monitoring/system-routeros.client.js';
import {
  classifyRouterOsError,
  SystemRouterOsClient,
} from '../../../../backend/infrastructure/monitoring/system-routeros.client.js';

const credentials: RouterOsCredentials = {
  host: 'router.example.com',
  password: 'secret',
  port: 8729,
  timeoutMs: 3_000,
  tls: true,
  username: 'monitoring',
};

describe('SystemRouterOsClient', () => {
  it('ejecuta únicamente resource y interface stats y siempre cierra', async () => {
    const client = fakeClient();
    vi.mocked(client.print)
      .mockResolvedValueOnce([
        {
          'cpu-load': '10',
          'free-memory': '100',
          'total-memory': '200',
          uptime: '1h',
        },
      ])
      .mockResolvedValueOnce([
        { name: 'ether1', running: 'true', 'rx-byte': '10', 'tx-byte': '20' },
      ]);
    const factory: RouterOsLibraryClientFactory = {
      create: vi.fn().mockReturnValue(client),
    };
    const systemClient = new SystemRouterOsClient({ factory });

    await expect(systemClient.query(credentials)).resolves.toEqual({
      snapshot: {
        interfaces: [{ name: 'ether1', running: 'true', 'rx-byte': '10', 'tx-byte': '20' }],
        systemResources: [
          {
            'cpu-load': '10',
            'free-memory': '100',
            'total-memory': '200',
            uptime: '1h',
          },
        ],
      },
      success: true,
    });
    expect(factory.create).toHaveBeenCalledWith(credentials);
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.print).toHaveBeenNthCalledWith(1, '/system/resource/print', {
      attributes: {
        '.proplist': ['cpu-load', 'free-memory', 'total-memory', 'uptime'],
      },
      timeoutMs: 3_000,
    });
    expect(client.print).toHaveBeenNthCalledWith(2, '/interface/print', {
      attributes: {
        '.proplist': ['.id', 'name', 'running', 'disabled', 'rx-byte', 'tx-byte'],
        stats: '',
      },
      timeoutMs: 3_000,
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it.each([
    [Object.assign(new Error('authentication failed'), { code: 'auth_failed' }), 'authentication'],
    [Object.assign(new Error('timeout'), { code: 'connection_timeout' }), 'timeout'],
    [Object.assign(new Error('refused'), { code: 'connection_refused' }), 'unreachable'],
    [Object.assign(new Error('certificate invalid'), { code: 'tls_failed' }), 'tls'],
    [new Error('malformed response'), 'execution'],
  ])('clasifica fallos de librería y cierra la sesión', async (error, errorType) => {
    const client = fakeClient();
    vi.mocked(client.connect).mockRejectedValue(error);
    const systemClient = new SystemRouterOsClient({
      factory: { create: vi.fn().mockReturnValue(client) },
    });

    await expect(systemClient.query(credentials)).resolves.toEqual({
      errorType,
      success: false,
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('rechaza credenciales inválidas sin crear cliente de librería', async () => {
    const factory: RouterOsLibraryClientFactory = { create: vi.fn() };
    const systemClient = new SystemRouterOsClient({ factory });

    await expect(
      systemClient.query({ ...credentials, host: 'router.example.com;whoami' }),
    ).resolves.toEqual({ errorType: 'execution', success: false });
    expect(factory.create).not.toHaveBeenCalled();
  });
});

describe('RouterOS error classifier', () => {
  it('clasifica códigos de socket y valores desconocidos', () => {
    expect(classifyRouterOsError(Object.assign(new Error('socket'), { code: 'ENETUNREACH' }))).toBe(
      'unreachable',
    );
    expect(classifyRouterOsError('unknown')).toBe('execution');
  });
});

function fakeClient(): RouterOsLibraryClient {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    print: vi.fn().mockResolvedValue([]),
  };
}
