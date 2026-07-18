import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference, InventoryReader } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../../../backend/application/ports/monitoring/monitoring-collector.port.js';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';
import { CollectorRegistry } from '../../../../backend/infrastructure/monitoring/collector-registry.js';
import { MonitoringWorker } from '../../../../backend/infrastructure/workers/monitoring-worker.js';
import type { WorkLease, WorkerExecutionContext } from '../../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerRole } from '../../../../backend/infrastructure/workers/worker-role.js';

const occurredAt = new Date('2026-07-17T12:00:00.000Z');

describe('MonitoringWorker', () => {
  it('lee Inventory, selecciona el collector y delega el batch sin requerir SQLite', async () => {
    const item = equipment({ id: 'router-1', type: 'router' });
    const inventory = inventoryReader([item]);
    const unsupported: MonitoringCollector = {
      collect: vi.fn().mockResolvedValue([]),
      supports: vi.fn().mockReturnValue(false),
    };
    const collect = vi.fn().mockResolvedValue([observation(item.id, 12)]);
    const compatible: MonitoringCollector = {
      collect,
      supports: vi.fn().mockImplementation((candidate) => candidate.type === 'router'),
    };
    const execute = vi.fn().mockResolvedValue(undefined);
    const worker = new MonitoringWorker({
      collectors: new CollectorRegistry([unsupported, compatible]),
      inventory,
      recordObservations: { execute },
    });

    await expect(worker.runOnce(executionContext())).resolves.toEqual({ outcome: 'processed' });
    expect(inventory.listEquipment).toHaveBeenCalledOnce();
    expect(collect).toHaveBeenCalledWith(item);
    expect(execute).toHaveBeenCalledWith('company-1', [
      {
        equipmentId: 'router-1',
        metricType: 'ping_latency',
        source: 'test-collector',
        timestamp: occurredAt,
        unit: 'ms',
        value: 12,
      },
    ]);
  });

  it('queda idle y no envía batch cuando no hay collectors compatibles', async () => {
    const inventory = inventoryReader([equipment({ id: 'router-1' })]);
    const execute = vi.fn().mockResolvedValue(undefined);
    const worker = new MonitoringWorker({
      collectors: new CollectorRegistry(),
      inventory,
      recordObservations: { execute },
    });

    await expect(worker.runOnce(executionContext())).resolves.toEqual({ outcome: 'idle' });
    expect(inventory.listEquipment).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('aísla el error de un collector, procesa los demás y reporta retry', async () => {
    const router = equipment({ id: 'router-1', type: 'router' });
    const switchEquipment = equipment({ id: 'switch-1', type: 'switch' });
    const failing: MonitoringCollector = {
      collect: vi.fn().mockRejectedValue(new Error('collector unavailable')),
      supports: vi.fn().mockImplementation((candidate) => candidate.type === 'router'),
    };
    const successfulCollect = vi.fn().mockResolvedValue([observation(switchEquipment.id, 7)]);
    const successful: MonitoringCollector = {
      collect: successfulCollect,
      supports: vi.fn().mockImplementation((candidate) => candidate.type === 'switch'),
    };
    const execute = vi.fn().mockResolvedValue(undefined);
    const worker = new MonitoringWorker({
      collectors: new CollectorRegistry([failing, successful]),
      inventory: inventoryReader([router, switchEquipment]),
      recordObservations: { execute },
    });

    await expect(worker.runOnce(executionContext())).resolves.toEqual({
      error: 'router-1: Error: collector unavailable',
      outcome: 'retried',
    });
    expect(successfulCollect).toHaveBeenCalledWith(switchEquipment);
    expect(execute).toHaveBeenCalledWith('company-1', [
      expect.objectContaining({ equipmentId: 'switch-1', value: 7 }),
    ]);
  });

  it('respeta el intervalo periódico antes de volver a consultar Inventory', async () => {
    let currentTime = new Date(occurredAt);
    const inventory = inventoryReader([]);
    const worker = new MonitoringWorker(
      {
        collectors: new CollectorRegistry(),
        inventory,
        recordObservations: { execute: vi.fn().mockResolvedValue(undefined) },
      },
      { clock: { now: () => currentTime }, intervalMs: 1_000 },
    );

    await worker.runOnce(executionContext());
    currentTime = new Date(occurredAt.getTime() + 999);
    await worker.runOnce(executionContext());
    expect(inventory.listEquipment).toHaveBeenCalledOnce();

    currentTime = new Date(occurredAt.getTime() + 1_000);
    await worker.runOnce(executionContext());
    expect(inventory.listEquipment).toHaveBeenCalledTimes(2);
  });
});

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

function inventoryReader(items: InventoryEquipmentReference[]): InventoryReader {
  return {
    findEquipmentById: vi.fn().mockImplementation((equipmentId: string) =>
      Promise.resolve(items.find((item) => item.id === equipmentId) ?? null),
    ),
    listEquipment: vi.fn().mockResolvedValue(items),
  };
}

function observation(equipmentId: string, value: number): Observation {
  return Observation.create({
    equipmentId,
    id: `observation-${equipmentId}`,
    metricType: 'ping_latency',
    occurredAt,
    source: 'test-collector',
    unit: 'ms',
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
