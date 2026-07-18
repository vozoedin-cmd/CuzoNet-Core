import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { InventoryReader } from '../../../backend/application/ports/monitoring/inventory.reader.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { CollectorRegistry } from '../../../backend/infrastructure/monitoring/collector-registry.js';
import { NoOpCollector } from '../../../backend/infrastructure/monitoring/no-op.collector.js';
import { MonitoringWorker } from '../../../backend/infrastructure/workers/monitoring-worker.js';
import { SqliteWorkLeaseRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-work-lease-repository.js';
import { SqliteWorkerStatisticsRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-worker-statistics-repository.js';
import { WorkerHost } from '../../../backend/infrastructure/workers/worker-host.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

const now = new Date('2026-07-17T12:00:00.000Z');
const clock: Clock = { now: () => now };

describe('MonitoringWorker registration in WorkerHost', () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
    new MigrationRunner(database.connection, clock).migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  it('ejecuta el rol monitoring con leases y estadísticas SQLite', async () => {
    const inventory: InventoryReader = {
      findEquipmentById: vi.fn().mockResolvedValue(null),
      listEquipment: vi.fn().mockResolvedValue([]),
    };
    const worker = new MonitoringWorker({
      collectors: new CollectorRegistry([new NoOpCollector()]),
      inventory,
      recordObservations: { execute: vi.fn().mockResolvedValue(undefined) },
    });
    const statistics = new SqliteWorkerStatisticsRepository(database.session);
    await statistics.recordStarted(WorkerRole.Monitoring, 'monitoring-test', now);
    const host = new WorkerHost(
      [worker],
      new SqliteWorkLeaseRepository(database.session),
      statistics,
      'monitoring-test',
      { leaseDurationMs: 10_000, leaseRenewalMs: 2_000 },
      clock,
    );

    await expect(host.runOnce(WorkerRole.Monitoring)).resolves.toEqual({ outcome: 'idle' });
    expect(host.getHealth().roles).toEqual([
      expect.objectContaining({ role: WorkerRole.Monitoring, status: 'idle' }),
    ]);
    expect(
      database.connection
        .prepare('SELECT role, worker_id FROM worker_statistics WHERE role = ?')
        .get(WorkerRole.Monitoring),
    ).toEqual({ role: 'monitoring', worker_id: 'monitoring-test' });
    expect(
      database.connection
        .prepare('SELECT role, work_id FROM work_leases WHERE role = ?')
        .get(WorkerRole.Monitoring),
    ).toEqual({ role: 'monitoring', work_id: 'monitoring-collection-cycle' });
  });
});
