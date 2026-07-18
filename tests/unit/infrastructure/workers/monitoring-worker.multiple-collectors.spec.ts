import { describe, expect, it, vi } from 'vitest';

import type {
  InventoryEquipmentReference,
  InventoryReader,
} from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../../../backend/application/ports/monitoring/monitoring-collector.port.js';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';
import { CollectorRegistry } from '../../../../backend/infrastructure/monitoring/collector-registry.js';
import { NoOpCollector } from '../../../../backend/infrastructure/monitoring/no-op.collector.js';
import { MonitoringWorker } from '../../../../backend/infrastructure/workers/monitoring-worker.js';
import type {
  WorkLease,
  WorkerExecutionContext,
} from '../../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerRole } from '../../../../backend/infrastructure/workers/worker-role.js';

const occurredAt = new Date('2026-07-18T12:00:00.000Z');
const item: InventoryEquipmentReference = {
  capabilities: {},
  companyId: 'company-1',
  id: 'router-1',
  managementHost: 'router.example.com',
  role: 'core',
  status: 'active',
  type: 'router',
};

describe('MonitoringWorker with multiple collectors', () => {
  it('ejecuta Ping y SNMP secuencialmente y agrupa sus observaciones', async () => {
    const order: string[] = [];
    const ping = collector(async () => {
      order.push('ping');
      return [observation('ping_latency', 10, 'ms', 'icmp-ping')];
    });
    const snmp = collector(async () => {
      order.push('snmp');
      return [observation('uptime', 60, 'seconds', 'snmp')];
    });
    const execute = vi.fn().mockResolvedValue(undefined);
    const worker = workerFor([ping, snmp, new NoOpCollector()], execute);

    await expect(worker.runOnce(executionContext())).resolves.toEqual({
      outcome: 'processed',
    });
    expect(order).toEqual(['ping', 'snmp']);
    expect(execute).toHaveBeenCalledWith('company-1', [
      expect.objectContaining({ metricType: 'ping_latency', source: 'icmp-ping' }),
      expect.objectContaining({ metricType: 'uptime', source: 'snmp' }),
    ]);
  });

  it('registra el resultado de Ping aunque SNMP falle para el mismo equipo', async () => {
    const ping = collector(async () => [observation('ping_latency', 10, 'ms', 'icmp-ping')]);
    const snmp = collector(async () => {
      throw new Error('SNMP probe failed: timeout');
    });
    const execute = vi.fn().mockResolvedValue(undefined);
    const worker = workerFor([ping, snmp, new NoOpCollector()], execute);

    await expect(worker.runOnce(executionContext())).resolves.toEqual({
      error: 'router-1: Error: SNMP probe failed: timeout',
      outcome: 'retried',
    });
    expect(execute).toHaveBeenCalledWith('company-1', [
      expect.objectContaining({ metricType: 'ping_latency' }),
    ]);
  });
});

function workerFor(
  collectors: MonitoringCollector[],
  execute: ReturnType<typeof vi.fn>,
): MonitoringWorker {
  const inventory: InventoryReader = {
    findEquipmentById: vi.fn().mockResolvedValue(item),
    listEquipment: vi.fn().mockResolvedValue([item]),
  };
  return new MonitoringWorker({
    collectors: new CollectorRegistry(collectors),
    inventory,
    recordObservations: { execute },
  });
}

function collector(collect: MonitoringCollector['collect']): MonitoringCollector {
  return {
    collect: vi.fn().mockImplementation(collect),
    supports: vi.fn().mockReturnValue(true),
  };
}

function observation(
  metricType: string,
  value: number,
  unit: 'ms' | 'seconds',
  source: string,
): Observation {
  return Observation.create({
    equipmentId: item.id,
    id: `${source}-${metricType}`,
    metricType,
    occurredAt,
    source,
    unit,
    value,
  });
}

function executionContext(): WorkerExecutionContext {
  const signal = new AbortController().signal;
  const lease: WorkLease = {
    acquiredAt: occurredAt,
    expiresAt: new Date(occurredAt.getTime() + 10_000),
    fencingToken: 1,
    ownerId: 'test',
    renewedAt: occurredAt,
    role: WorkerRole.Monitoring,
    workId: 'monitoring-collection-cycle',
  };
  return {
    signal,
    async withLease<T>(
      workId: string,
      work: (workSignal: AbortSignal, workLease: WorkLease) => Promise<T>,
    ) {
      expect(workId).toBe('monitoring-collection-cycle');
      return { acquired: true, value: await work(signal, lease) };
    },
  };
}
