import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { RouterOsClient } from '../../../../backend/application/ports/monitoring/routeros-client.port.js';
import type {
  RouterOsCredentialProvider,
  RouterOsCredentials,
} from '../../../../backend/application/ports/monitoring/routeros-credential-provider.port.js';
import { RouterOsCollector } from '../../../../backend/infrastructure/monitoring/routeros.collector.js';

const credentials: RouterOsCredentials = {
  host: 'router.example.com',
  password: 'secret',
  port: 8729,
  timeoutMs: 2_000,
  tls: true,
  username: 'monitoring',
};

describe('RouterOsCollector', () => {
  it('genera recursos e interfaces y agrega tasas sólo desde el segundo muestreo', async () => {
    let currentTime = new Date('2026-07-18T12:00:00Z');
    const client: RouterOsClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce(successfulResult(1_000, 2_000))
        .mockResolvedValueOnce(successfulResult(2_000, 4_000)),
    };
    let sequence = 0;
    const collector = new RouterOsCollector(
      {
        client,
        credentialProvider: provider(),
        idGenerator: { generate: () => `observation-${++sequence}` },
      },
      { clock: { now: () => currentTime } },
    );
    const item = equipment();

    const first = await collector.collect(item);
    expect(metricSummary(first)).toEqual([
      metric('cpu_usage', 25, 'percent'),
      metric('memory_used', 3_000, 'bytes'),
      metric('memory_total', 4_000, 'bytes'),
      metric('uptime', 60, 'seconds'),
      metric('interfaces_up', 1, 'count'),
      metric('interfaces_down', 0, 'count'),
    ]);

    currentTime = new Date('2026-07-18T12:00:10Z');
    const second = await collector.collect(item);
    expect(metricSummary(second)).toEqual([
      metric('cpu_usage', 25, 'percent'),
      metric('memory_used', 3_000, 'bytes'),
      metric('memory_total', 4_000, 'bytes'),
      metric('uptime', 60, 'seconds'),
      metric('interfaces_up', 1, 'count'),
      metric('interfaces_down', 0, 'count'),
      metric('rx_bps', 800, 'bps'),
      metric('tx_bps', 1_600, 'bps'),
    ]);
    expect(client.query).toHaveBeenCalledWith(credentials);
  });

  it('sólo soporta equipo activo con credenciales para su host', () => {
    const credentialProvider = provider();
    const collector = new RouterOsCollector({
      client: { query: vi.fn() },
      credentialProvider,
      idGenerator: { generate: vi.fn() },
    });

    expect(collector.supports(equipment())).toBe(true);
    expect(collector.supports(equipment({ status: 'retired' }))).toBe(false);
    expect(credentialProvider.supports).toHaveBeenCalled();
  });

  it('no consulta el cliente cuando no hay credenciales', async () => {
    const client: RouterOsClient = { query: vi.fn() };
    const collector = new RouterOsCollector({
      client,
      credentialProvider: {
        getCredentials: vi.fn().mockResolvedValue(null),
        supports: vi.fn().mockReturnValue(false),
      },
      idGenerator: { generate: vi.fn() },
    });

    await expect(collector.collect(equipment())).resolves.toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('propaga un fallo tipado para aislamiento del worker', async () => {
    const collector = new RouterOsCollector({
      client: {
        query: vi.fn().mockResolvedValue({ errorType: 'timeout', success: false }),
      },
      credentialProvider: provider(),
      idGenerator: { generate: vi.fn() },
    });

    await expect(collector.collect(equipment())).rejects.toThrow('RouterOS query failed: timeout');
  });
});

function successfulResult(rxBytes: number, txBytes: number) {
  return {
    snapshot: {
      interfaces: [
        {
          name: 'ether1',
          running: 'true',
          'rx-byte': rxBytes.toString(),
          'tx-byte': txBytes.toString(),
        },
      ],
      systemResources: [
        {
          'cpu-load': '25',
          'free-memory': '1000',
          'total-memory': '4000',
          uptime: '1m',
        },
      ],
    },
    success: true as const,
  };
}

function provider(): RouterOsCredentialProvider {
  return {
    getCredentials: vi.fn().mockResolvedValue(credentials),
    supports: vi.fn().mockReturnValue(true),
  };
}

function equipment(
  overrides: Partial<InventoryEquipmentReference> = {},
): InventoryEquipmentReference {
  return {
    capabilities: {},
    companyId: 'company-1',
    id: 'router-1',
    managementHost: 'router.example.com',
    role: 'core',
    status: 'active',
    type: 'router',
    ...overrides,
  };
}

function metricSummary(observations: Awaited<ReturnType<RouterOsCollector['collect']>>) {
  return observations.map((observation) => ({
    equipmentId: observation.props.equipmentId,
    metricType: observation.props.metricType,
    source: observation.props.source,
    unit: observation.props.metricValue.unit,
    value: observation.props.metricValue.value,
  }));
}

function metric(metricType: string, value: number, unit: string) {
  return {
    equipmentId: 'router-1',
    metricType,
    source: 'routeros-api',
    unit,
    value,
  };
}
