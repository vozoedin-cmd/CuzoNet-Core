import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { PingProbe } from '../../../backend/application/ports/monitoring/ping-probe.port.js';
import type { RouterOsClient } from '../../../backend/application/ports/monitoring/routeros-client.port.js';
import type { SnmpProbe } from '../../../backend/application/ports/monitoring/snmp-probe.port.js';
import { RecordObservationBatchUseCase } from '../../../backend/application/use-cases/monitoring/record-observation-batch.usecase.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { CollectorRegistry } from '../../../backend/infrastructure/monitoring/collector-registry.js';
import { EnvironmentMonitoringCredentialProvider } from '../../../backend/infrastructure/monitoring/environment-monitoring-credential.provider.js';
import { EnvironmentRouterOsCredentialProvider } from '../../../backend/infrastructure/monitoring/environment-routeros-credential.provider.js';
import { InventoryMonitoringTargetResolver } from '../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { NoOpCollector } from '../../../backend/infrastructure/monitoring/no-op.collector.js';
import { PingCollector } from '../../../backend/infrastructure/monitoring/ping.collector.js';
import { RouterOsCollector } from '../../../backend/infrastructure/monitoring/routeros.collector.js';
import { SnmpCollector } from '../../../backend/infrastructure/monitoring/snmp.collector.js';
import { SourcePriorityObservationPolicy } from '../../../backend/infrastructure/monitoring/source-priority-observation.policy.js';
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

describe('MonitoringWorker RouterOsCollector integration', () => {
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

  it('ejecuta Ping/SNMP/RouterOS y persiste RouterOS como fuente prioritaria', async () => {
    const pingProbe: PingProbe = {
      probe: vi.fn().mockResolvedValue({
        latencyMs: 5,
        packetLossPercent: 0,
        reachable: true,
      }),
    };
    const snmpProbe: SnmpProbe = {
      probe: vi.fn().mockResolvedValue({
        success: true,
        values: [
          { oid: standardSnmpOids.sysUpTime, value: 1_000 },
          { oid: `${standardSnmpOids.hrProcessorLoad}.1`, value: 10 },
          {
            oid: `${standardSnmpOids.hrStorageType}.1`,
            value: standardSnmpOids.hrStorageRam,
          },
          { oid: `${standardSnmpOids.hrStorageAllocationUnits}.1`, value: 1 },
          { oid: `${standardSnmpOids.hrStorageSize}.1`, value: 100 },
          { oid: `${standardSnmpOids.hrStorageUsed}.1`, value: 50 },
          { oid: `${standardSnmpOids.ifOperStatus}.1`, value: 1 },
        ],
      }),
    };
    const routerOsClient: RouterOsClient = {
      query: vi.fn().mockResolvedValue({
        snapshot: {
          interfaces: [
            {
              name: 'ether1',
              running: 'true',
              'rx-byte': '1000',
              'tx-byte': '2000',
            },
            {
              name: 'ether2',
              running: 'false',
              'rx-byte': '0',
              'tx-byte': '0',
            },
          ],
          systemResources: [
            {
              'cpu-load': '40',
              'free-memory': '1000',
              'total-memory': '4000',
              uptime: '1m',
            },
          ],
        },
        success: true,
      }),
    };
    const inventory = new SqliteInventoryReaderAdapter(database.connection);
    const observations = new SqliteObservationRepository(database.connection);
    const states = new SqliteEquipmentStateRepository(database.connection);
    const idGenerator = new UuidV7IdGenerator();
    const targetResolver = new InventoryMonitoringTargetResolver();
    const ping = new PingCollector(
      { idGenerator, probe: pingProbe, targetResolver },
      { clock, timeoutMs: 1_000 },
    );
    const snmp = new SnmpCollector(
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
    const routerOs = new RouterOsCollector(
      {
        client: routerOsClient,
        credentialProvider: new EnvironmentRouterOsCredentialProvider({
          host: 'router.example.com',
          password: 'secret',
          timeoutMs: 1_000,
          tls: true,
          username: 'monitoring',
        }),
        idGenerator,
      },
      { clock },
    );
    const worker = new MonitoringWorker(
      {
        collectors: new CollectorRegistry([ping, snmp, routerOs, new NoOpCollector()]),
        inventory,
        observationPriorityPolicy: new SourcePriorityObservationPolicy(),
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
        lastLatencyMs: 5,
        status: 'UP',
        uptimeSeconds: 60,
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
      metric('cpu_usage', 'routeros-api', 'percent', 40),
      metric('interfaces_down', 'routeros-api', 'count', 1),
      metric('interfaces_up', 'routeros-api', 'count', 1),
      metric('memory_total', 'routeros-api', 'bytes', 4_000),
      metric('memory_used', 'routeros-api', 'bytes', 3_000),
      metric('packet_loss', 'icmp-ping', 'percent', 0),
      metric('ping_latency', 'icmp-ping', 'ms', 5),
      metric('uptime', 'routeros-api', 'seconds', 60),
    ]);
    expect(persisted).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'snmp' })]),
    );
    expect(pingProbe.probe).toHaveBeenCalledOnce();
    expect(snmpProbe.probe).toHaveBeenCalledOnce();
    expect(routerOsClient.query).toHaveBeenCalledOnce();
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
