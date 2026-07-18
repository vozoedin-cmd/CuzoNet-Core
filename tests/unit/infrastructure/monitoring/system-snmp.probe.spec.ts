import { describe, expect, it, vi } from 'vitest';

import type { SnmpV2cCredentials } from '../../../../backend/application/ports/monitoring/monitoring-credential-provider.port.js';
import type {
  SnmpSessionClient,
  SnmpSessionFactory,
} from '../../../../backend/infrastructure/monitoring/system-snmp.probe.js';
import {
  classifySnmpError,
  SystemSnmpProbe,
} from '../../../../backend/infrastructure/monitoring/system-snmp.probe.js';

const credentials: SnmpV2cCredentials = {
  community: 'secret',
  retries: 1,
  timeoutMs: 1_500,
  version: '2c',
};

describe('SystemSnmpProbe', () => {
  it('ejecuta un GET múltiple y consultas de subárbol en una sola sesión', async () => {
    const session = fakeSession();
    vi.mocked(session.get).mockResolvedValue([
      { oid: '1.3.6.1.2.1.1.3.0', value: 100 },
      { oid: '1.3.6.1.2.1.1.5.0', value: 'router' },
    ]);
    vi.mocked(session.subtree).mockResolvedValue([{ oid: '1.3.6.1.2.1.2.2.1.8.1', value: 1 }]);
    const factory: SnmpSessionFactory = { create: vi.fn().mockReturnValue(session) };
    const probe = new SystemSnmpProbe({ sessionFactory: factory });

    await expect(
      probe.probe('Router.EXAMPLE.COM', credentials, {
        oids: ['1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.1.5.0'],
        subtrees: ['1.3.6.1.2.1.2.2.1.8'],
      }),
    ).resolves.toEqual({
      success: true,
      values: [
        { oid: '1.3.6.1.2.1.1.3.0', value: 100 },
        { oid: '1.3.6.1.2.1.1.5.0', value: 'router' },
        { oid: '1.3.6.1.2.1.2.2.1.8.1', value: 1 },
      ],
    });
    expect(factory.create).toHaveBeenCalledWith('router.example.com', credentials);
    expect(session.get).toHaveBeenCalledWith(['1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.1.5.0']);
    expect(session.subtree).toHaveBeenCalledWith('1.3.6.1.2.1.2.2.1.8');
    expect(session.close).toHaveBeenCalledOnce();
  });

  it.each([
    [Object.assign(new Error('request timed out'), { name: 'RequestTimedOutError' }), 'timeout'],
    [Object.assign(new Error('host unreachable'), { code: 'EHOSTUNREACH' }), 'unreachable'],
    [Object.assign(new Error('not authorized'), { status: 16 }), 'authentication'],
    [new Error('malformed response'), 'execution'],
  ])('clasifica errores sin exponer la community', async (error, errorType) => {
    const session = fakeSession();
    vi.mocked(session.get).mockRejectedValue(error);
    const probe = new SystemSnmpProbe({
      sessionFactory: { create: vi.fn().mockReturnValue(session) },
    });

    await expect(
      probe.probe('192.0.2.1', credentials, {
        oids: ['1.3.6.1.2.1.1.3.0'],
        subtrees: [],
      }),
    ).resolves.toEqual({ errorType, success: false, values: [] });
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('rechaza host u OID inválidos antes de crear una sesión', async () => {
    const factory: SnmpSessionFactory = { create: vi.fn() };
    const probe = new SystemSnmpProbe({ sessionFactory: factory });

    await expect(
      probe.probe('router.example.com;whoami', credentials, {
        oids: ['not-an-oid'],
        subtrees: [],
      }),
    ).resolves.toEqual({ errorType: 'execution', success: false, values: [] });
    expect(factory.create).not.toHaveBeenCalled();
  });
});

describe('SNMP error classifier', () => {
  it('clasifica códigos de red y valores desconocidos', () => {
    expect(classifySnmpError(Object.assign(new Error('socket'), { code: 'ENETUNREACH' }))).toBe(
      'unreachable',
    );
    expect(classifySnmpError('not-an-error')).toBe('execution');
  });
});

function fakeSession(): SnmpSessionClient {
  return {
    close: vi.fn(),
    get: vi.fn().mockResolvedValue([]),
    subtree: vi.fn().mockResolvedValue([]),
  };
}
