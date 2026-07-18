import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { PingProbe } from '../../../backend/application/ports/monitoring/ping-probe.port.js';
import type { SnmpProbe } from '../../../backend/application/ports/monitoring/snmp-probe.port.js';
import { RecordObservationBatchUseCase } from '../../../backend/application/use-cases/monitoring/record-observation-batch.usecase.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { CollectorRegistry } from '../../../backend/infrastructure/monitoring/collector-registry.js';
import { EnvironmentMonitoringCredentialProvider } from '../../../backend/infrastructure/monitoring/environment-monitoring-credential.provider.js';
import { InventoryMonitoringTargetResolver } from '../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { NoOpCollector } from '../../../backend/infrastructure/monitoring/no-op.collector.js';
import { PingCollector } from '../../../backend/infrastructure/monitoring/ping.collector.js';
import { SnmpCollector } from '../../../backend/infrastructure/monitoring/snmp.collector.js';
import { SqliteEquipmentStateRepository } from '../../../backend/infrastructure/monitoring/sqlite-equipment-state.repository.js';
import { SqliteInventoryReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-inventory-reader.adapter.js';
import { SqliteObservationRepository } from '../../../backend/infrastructure/monitoring/sqlite-observation.repository.js';
import { standardSnmpOids } from '../../../backend/infrastructure/monitoring/standard-snmp-metrics.js';
import { MonitoringWorker } from '../../../backend/infrastructure/workers/monitoring-worker.js';
import type {
  WorkLease,
  WorkerExecutionContext,
} from '../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const clock: Clock = { now: () => now };

describe('MonitoringWorker SnmpCollector integration', () => {
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
    database.connection
      .prepare(
        `
          INSERT INTO network_assets (
            id, company_id, asset_type, status, acquired_on, role, capabilities,
            management_host
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        'router-1',
        companyId,
        'router',
        'active',
        now.toISOString(),
        'core',
        '{}',
        'router.example.com',
      );
  });

  afterEach(async () => {
    await database.close();
  });

  it('fluye Inventory → Ping/SNMP → RecordObservationBatch → EquipmentState', async () => {
    const pingProbe: PingProbe = {
      probe: vi.fn().mockResolvedValue({
        latencyMs: 7,
        packetLossPercent: 0,
        reachable: true,
      }),
    };
    const snmpProbe: SnmpProbe = {
      probe: vi.fn().mockResolvedValue({
        success: true,
        values: [
          { oid: standardSnmpOids.sysUpTime, value: 12_000 },
          { oid: `${standardSnmpOids.hrProcessorLoad}.1`, value: 35 },
          {
            oid: `${standardSnmpOids.hrStorageType}.3`,
            value: standardSnmpOids.hrStorageRam,
          },
          { oid: `${standardSnmpOids.hrStorageAllocationUnits}.3`, value: 1_024 },
          { oid: `${standardSnmpOids.hrStorageSize}.3`, value: 10_000 },
          { oid: `${standardSnmpOids.hrStorageUsed}.3`, value: 4_000 },
          { oid: `${standardSnmpOids.ifOperStatus}.1`, value: 1 },
          { oid: `${standardSnmpOids.ifOperStatus}.2`, value: 2 },
        ],
      }),
    };
    const inventory = new SqliteInventoryReaderAdapter(database.connection);
    const observations = new SqliteObservationRepository(database.connection);
    const states = new SqliteEquipmentStateRepository(database.connection);
    const idGenerator = new UuidV7IdGenerator();
    const targetResolver = new InventoryMonitoringTargetResolver();
    const pingCollector = new PingCollector(
      { idGenerator, probe: pingProbe, targetResolver },
      { clock, timeoutMs: 1_000 },
    );
    const snmpCollector = new SnmpCollector(
      {
        credentialProvider: new EnvironmentMonitoringCredentialProvider({
          community: 'private',
          retries: 1,
          timeoutMs: 1_000,
        }),
        idGenerator,
        probe: snmpProbe,
        targetResolver,
      },
      { clock },
    );
    const worker = new MonitoringWorker(
      {
        collectors: new CollectorRegistry([pingCollector, snmpCollector, new NoOpCollector()]),
        inventory,
        recordObservations: new RecordObservationBatchUseCase(
          observations,
          states,
          inventory,
          idGenerator,
        ),
      },
      { clock },
    );

    await expect(worker.runOnce(executionContext())).resolves.toEqual({
      outcome: 'processed',
    });
    await expect(states.findById('router-1')).resolves.toMatchObject({
      props: expect.objectContaining({
        lastLatencyMs: 7,
        status: 'UP',
        uptimeSeconds: 120,
      }),
    });

    const persisted = database.connection
      .prepare(
        `
          SELECT metric_type, source, unit, value
          FROM monitoring_observations
          WHERE equipment_id = ?
          ORDER BY metric_type
        `,
      )
      .all('router-1');
    expect(persisted).toEqual([
      metric('cpu_usage', 'snmp', 'percent', 35),
      metric('interfaces_down', 'snmp', 'count', 1),
      metric('interfaces_up', 'snmp', 'count', 1),
      metric('memory_total', 'snmp', 'bytes', 10_240_000),
      metric('memory_used', 'snmp', 'bytes', 4_096_000),
      metric('packet_loss', 'icmp-ping', 'percent', 0),
      metric('ping_latency', 'icmp-ping', 'ms', 7),
      metric('uptime', 'snmp', 'seconds', 120),
    ]);
    expect(pingProbe.probe).toHaveBeenCalledOnce();
    expect(snmpProbe.probe).toHaveBeenCalledOnce();
  });
});

function metric(metricType: string, source: string, unit: string, value: number) {
  return { metric_type: metricType, source, unit, value };
}

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
