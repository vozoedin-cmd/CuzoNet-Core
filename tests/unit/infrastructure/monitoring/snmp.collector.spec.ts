import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { MonitoringCredentialProvider } from '../../../../backend/application/ports/monitoring/monitoring-credential-provider.port.js';
import type { SnmpProbe } from '../../../../backend/application/ports/monitoring/snmp-probe.port.js';
import { InventoryMonitoringTargetResolver } from '../../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { SnmpCollector } from '../../../../backend/infrastructure/monitoring/snmp.collector.js';
import {
  standardSnmpOids,
  standardSnmpRequest,
} from '../../../../backend/infrastructure/monitoring/standard-snmp-metrics.js';

const occurredAt = new Date('2026-07-18T12:00:00.000Z');

describe('SnmpCollector', () => {
  it('genera las seis métricas con equipmentId, timestamp y source contractuales', async () => {
    const probe: SnmpProbe = {
      probe: vi.fn().mockResolvedValue({
        success: true,
        values: [
          { oid: standardSnmpOids.sysUpTime, value: 50_000 },
          { oid: `${standardSnmpOids.hrProcessorLoad}.1`, value: 25 },
          {
            oid: `${standardSnmpOids.hrStorageType}.2`,
            value: standardSnmpOids.hrStorageRam,
          },
          { oid: `${standardSnmpOids.hrStorageAllocationUnits}.2`, value: 1_024 },
          { oid: `${standardSnmpOids.hrStorageSize}.2`, value: 2_000 },
          { oid: `${standardSnmpOids.hrStorageUsed}.2`, value: 1_000 },
          { oid: `${standardSnmpOids.ifOperStatus}.1`, value: 1 },
          { oid: `${standardSnmpOids.ifOperStatus}.2`, value: 2 },
        ],
      }),
    };
    const collector = createCollector(probe, credentialProvider());
    const item = equipment({ id: 'router-1', managementHost: 'router.example.com' });

    const observations = await collector.collect(item);

    expect(probe.probe).toHaveBeenCalledWith(
      'router.example.com',
      {
        community: 'private',
        retries: 1,
        timeoutMs: 2_000,
        version: '2c',
      },
      standardSnmpRequest,
    );
    expect(
      observations.map((observation) => ({
        equipmentId: observation.props.equipmentId,
        metricType: observation.props.metricType,
        occurredAt: observation.props.occurredAt,
        source: observation.props.source,
        unit: observation.props.metricValue.unit,
        value: observation.props.metricValue.value,
      })),
    ).toEqual([
      metric('router-1', 'cpu_usage', 25, 'percent'),
      metric('router-1', 'memory_used', 1_024_000, 'bytes'),
      metric('router-1', 'memory_total', 2_048_000, 'bytes'),
      metric('router-1', 'uptime', 500, 'seconds'),
      metric('router-1', 'interfaces_up', 1, 'count'),
      metric('router-1', 'interfaces_down', 1, 'count'),
    ]);
    expect(new Set(observations.map((observation) => observation.props.occurredAt))).toEqual(
      new Set([occurredAt]),
    );
  });

  it('no consulta SNMP si no existen credenciales', async () => {
    const probe: SnmpProbe = { probe: vi.fn() };
    const collector = createCollector(probe, {
      getSnmpV2cCredentials: vi.fn().mockResolvedValue(null),
    });

    await expect(collector.collect(equipment({ managementHost: '192.0.2.1' }))).resolves.toEqual(
      [],
    );
    expect(probe.probe).not.toHaveBeenCalled();
  });

  it('propaga un fallo tipado para que MonitoringWorker lo aísle y reporte', async () => {
    const collector = createCollector(
      {
        probe: vi.fn().mockResolvedValue({
          errorType: 'timeout',
          success: false,
          values: [],
        }),
      },
      credentialProvider(),
    );

    await expect(collector.collect(equipment({ managementHost: '192.0.2.1' }))).rejects.toThrow(
      'SNMP probe failed: timeout',
    );
  });

  it('sólo soporta equipos activos con ManagementHost', () => {
    const collector = createCollector({ probe: vi.fn() }, credentialProvider());

    expect(collector.supports(equipment({ managementHost: 'router.example.com' }))).toBe(true);
    expect(collector.supports(equipment())).toBe(false);
    expect(
      collector.supports(equipment({ managementHost: 'router.example.com', status: 'retired' })),
    ).toBe(false);
  });
});

function createCollector(probe: SnmpProbe, provider: MonitoringCredentialProvider): SnmpCollector {
  let sequence = 0;
  return new SnmpCollector(
    {
      credentialProvider: provider,
      idGenerator: { generate: () => `observation-${++sequence}` },
      probe,
      targetResolver: new InventoryMonitoringTargetResolver(),
    },
    { clock: { now: () => occurredAt } },
  );
}

function credentialProvider(): MonitoringCredentialProvider {
  return {
    getSnmpV2cCredentials: vi.fn().mockResolvedValue({
      community: 'private',
      retries: 1,
      timeoutMs: 2_000,
      version: '2c',
    }),
  };
}

function equipment(
  overrides: Partial<InventoryEquipmentReference> = {},
): InventoryEquipmentReference {
  return {
    capabilities: {},
    companyId: 'company-1',
    id: 'equipment-1',
    role: 'core',
    status: 'active',
    type: 'router',
    ...overrides,
  };
}

function metric(equipmentId: string, metricType: string, value: number, unit: string) {
  return {
    equipmentId,
    metricType,
    occurredAt,
    source: 'snmp',
    unit,
    value,
  };
}
