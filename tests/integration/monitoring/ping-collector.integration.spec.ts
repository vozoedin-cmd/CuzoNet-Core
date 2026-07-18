import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { PingProbe } from '../../../backend/application/ports/monitoring/ping-probe.port.js';
import { RecordObservationBatchUseCase } from '../../../backend/application/use-cases/monitoring/record-observation-batch.usecase.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { CollectorRegistry } from '../../../backend/infrastructure/monitoring/collector-registry.js';
import { InventoryMonitoringTargetResolver } from '../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { NoOpCollector } from '../../../backend/infrastructure/monitoring/no-op.collector.js';
import { PingCollector } from '../../../backend/infrastructure/monitoring/ping.collector.js';
import { SqliteEquipmentStateRepository } from '../../../backend/infrastructure/monitoring/sqlite-equipment-state.repository.js';
import { SqliteInventoryReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-inventory-reader.adapter.js';
import { SqliteObservationRepository } from '../../../backend/infrastructure/monitoring/sqlite-observation.repository.js';
import { MonitoringWorker } from '../../../backend/infrastructure/workers/monitoring-worker.js';
import type {
  WorkLease,
  WorkerExecutionContext,
} from '../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const clock: Clock = { now: () => now };

describe('MonitoringWorker PingCollector integration', () => {
  let companyId: string;
  let database: SqliteDatabase;

  beforeEach(async () => {
    database = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
    new MigrationRunner(database.connection, clock).migrate();
    companyId = await new CompanyBootstrap(database.session, new UuidV7IdGenerator()).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      now,
    );
    insertEquipment('equipment-down', 'down.example.com');
    insertEquipment('equipment-up', 'up.example.com');
  });

  afterEach(async () => {
    await database.close();
  });

  it('proyecta UP y DOWN mediante el flujo completo sin ping real', async () => {
    const probe: PingProbe = {
      probe: vi.fn().mockImplementation((host: string) =>
        Promise.resolve(
          host === 'up.example.com'
            ? {
                latencyMs: 9,
                packetLossPercent: 0,
                reachable: true,
              }
            : {
                errorType: 'timeout',
                packetLossPercent: 100,
                reachable: false,
              },
        ),
      ),
    };
    const inventory = new SqliteInventoryReaderAdapter(database.connection);
    const observationRepository = new SqliteObservationRepository(database.connection);
    const stateRepository = new SqliteEquipmentStateRepository(database.connection);
    const idGenerator = new UuidV7IdGenerator();
    const pingCollector = new PingCollector(
      {
        idGenerator,
        probe,
        targetResolver: new InventoryMonitoringTargetResolver(),
      },
      { clock, timeoutMs: 1_000 },
    );
    const worker = new MonitoringWorker(
      {
        collectors: new CollectorRegistry([pingCollector, new NoOpCollector()]),
        inventory,
        recordObservations: new RecordObservationBatchUseCase(
          observationRepository,
          stateRepository,
          inventory,
          idGenerator,
        ),
      },
      { clock },
    );

    await expect(worker.runOnce(executionContext())).resolves.toEqual({
      outcome: 'processed',
    });
    await expect(stateRepository.findById('equipment-up')).resolves.toMatchObject({
      props: expect.objectContaining({ lastLatencyMs: 9, status: 'UP' }),
    });
    await expect(stateRepository.findById('equipment-down')).resolves.toMatchObject({
      props: expect.objectContaining({ status: 'DOWN' }),
    });

    const observations = database.connection
      .prepare(
        `
          SELECT equipment_id, metric_type, value, unit, source
          FROM monitoring_observations
          ORDER BY equipment_id, metric_type
        `,
      )
      .all();
    expect(observations).toEqual([
      {
        equipment_id: 'equipment-down',
        metric_type: 'packet_loss',
        source: 'icmp-ping',
        unit: 'percent',
        value: 100,
      },
      {
        equipment_id: 'equipment-up',
        metric_type: 'packet_loss',
        source: 'icmp-ping',
        unit: 'percent',
        value: 0,
      },
      {
        equipment_id: 'equipment-up',
        metric_type: 'ping_latency',
        source: 'icmp-ping',
        unit: 'ms',
        value: 9,
      },
    ]);
    expect(probe.probe).toHaveBeenCalledTimes(2);
  });

  function insertEquipment(id: string, managementHost: string): void {
    database.connection
      .prepare(
        `
          INSERT INTO network_assets (
            id, company_id, asset_type, status, acquired_on, role, capabilities,
            management_host
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(id, companyId, 'router', 'active', now.toISOString(), 'core', '{}', managementHost);
  }
});

function executionContext(): WorkerExecutionContext {
  const signal = new AbortController().signal;
  const lease: WorkLease = {
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + 10_000),
    fencingToken: 1,
    ownerId: 'test',
    renewedAt: now,
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
