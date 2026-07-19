import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EvaluateAlertsUseCase } from '../../../backend/application/use-cases/alerting/evaluate-alerts.usecase.js';
import { IncidentEngine } from '../../../backend/application/use-cases/alerting/incident-engine.js';
import { InstallDefaultAlertRulesUseCase } from '../../../backend/application/use-cases/alerting/install-default-alert-rules.usecase.js';
import { RecordObservationBatchUseCase } from '../../../backend/application/use-cases/monitoring/record-observation-batch.usecase.js';
import type { MonitoringCollector } from '../../../backend/application/ports/monitoring/monitoring-collector.port.js';
import { AlertEvaluator } from '../../../backend/domain/alerting/alert-evaluator.js';
import { Observation } from '../../../backend/domain/monitoring/observation.js';
import { NoOpMaintenanceWindowProvider } from '../../../backend/infrastructure/alerting/no-op-maintenance-window.provider.js';
import { SqliteAlertEvaluationStateRepository } from '../../../backend/infrastructure/alerting/sqlite-alert-evaluation-state.repository.js';
import { SqliteAlertRuleRepository } from '../../../backend/infrastructure/alerting/sqlite-alert-rule.repository.js';
import { SqliteIncidentEventRepository } from '../../../backend/infrastructure/alerting/sqlite-incident-event.repository.js';
import { SqliteIncidentRepository } from '../../../backend/infrastructure/alerting/sqlite-incident.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { SqliteOutboxRepository } from '../../../backend/infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { CollectorRegistry } from '../../../backend/infrastructure/monitoring/collector-registry.js';
import { SqliteEquipmentStateRepository } from '../../../backend/infrastructure/monitoring/sqlite-equipment-state.repository.js';
import { SqliteInventoryReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-inventory-reader.adapter.js';
import { SqliteObservationRepository } from '../../../backend/infrastructure/monitoring/sqlite-observation.repository.js';
import { MonitoringWorker } from '../../../backend/infrastructure/workers/monitoring-worker.js';
import type {
  WorkLease,
  WorkerExecutionContext,
} from '../../../backend/infrastructure/workers/worker-contracts.js';

const baseTime = new Date('2026-07-18T12:00:00.000Z');

describe('MonitoringWorker to Alerting integration', () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    database.connection
      .prepare(
        `INSERT INTO companies (
      id, legal_name, display_name, currency_code, timezone, status, created_at
    ) VALUES ('company-1', 'Company One', 'Company One', 'GTQ', 'UTC', 'active', ?)`,
      )
      .run(baseTime.toISOString());
    database.connection
      .prepare(
        `INSERT INTO network_assets (
      id, company_id, asset_type, role, status, capabilities, acquired_on
    ) VALUES ('equipment-1', 'company-1', 'router', 'edge', 'active', '[]', ?)`,
      )
      .run(baseTime.toISOString());
  });

  afterEach(async () => database.close());

  it('persists a CPU incident and outbox event after five continuous minutes', async () => {
    const observations = new SqliteObservationRepository(database.connection);
    const states = new SqliteEquipmentStateRepository(database.connection);
    const inventory = new SqliteInventoryReaderAdapter(database.connection);
    const rules = new SqliteAlertRuleRepository(database.connection);
    const incidents = new SqliteIncidentRepository(database.connection);
    const incidentEvents = new SqliteIncidentEventRepository(database.connection);
    const evaluationStates = new SqliteAlertEvaluationStateRepository(database.connection);
    let generatedId = 0;
    const ids = { generate: () => `generated-${++generatedId}` };
    await new InstallDefaultAlertRulesUseCase(rules, ids, { now: () => baseTime }).execute(
      'company-1',
    );
    const engine = new IncidentEngine(
      incidents,
      incidentEvents,
      new SqliteOutboxRepository(database.session),
      new SqliteUnitOfWork(database.session),
      ids,
    );
    const alerting = new EvaluateAlertsUseCase(
      rules,
      evaluationStates,
      new AlertEvaluator(),
      engine,
      new NoOpMaintenanceWindowProvider(),
    );
    const recorder = new RecordObservationBatchUseCase(
      observations,
      states,
      inventory,
      ids,
      alerting,
    );
    let now = baseTime;
    const collector: MonitoringCollector = {
      collect: (equipment) =>
        Promise.resolve([
          Observation.create({
            equipmentId: equipment.id,
            id: ids.generate(),
            metricType: 'cpu_usage',
            occurredAt: now,
            source: 'fake-routeros',
            unit: 'percent',
            value: 95,
          }),
        ]),
      supports: () => true,
    };
    const worker = new MonitoringWorker(
      { collectors: new CollectorRegistry([collector]), inventory, recordObservations: recorder },
      { clock: { now: () => now }, intervalMs: 1 },
    );
    const context: WorkerExecutionContext = {
      signal: new AbortController().signal,
      withLease: async (_workId, operation) => ({
        acquired: true as const,
        value: await operation(new AbortController().signal, {} as WorkLease),
      }),
    };

    for (const seconds of [0, 60, 120, 180, 240, 300]) {
      now = new Date(baseTime.getTime() + seconds * 1_000);
      await worker.runOnce(context);
    }

    expect(database.connection.prepare('SELECT status, severity FROM incidents').all()).toEqual([
      { severity: 'major', status: 'open' },
    ]);
    expect(database.connection.prepare('SELECT event_type FROM outbox_events').all()).toEqual([
      { event_type: 'IncidentOpened.v1' },
    ]);
    expect(
      database.connection.prepare('SELECT COUNT(*) AS count FROM alert_evaluation_states').get(),
    ).toEqual({ count: 1 });
  });

  it('keeps observations and EquipmentState when Alerting fails', async () => {
    const observations = new SqliteObservationRepository(database.connection);
    const states = new SqliteEquipmentStateRepository(database.connection);
    const inventory = new SqliteInventoryReaderAdapter(database.connection);
    const errors: Readonly<Record<string, unknown>>[] = [];
    const recorder = new RecordObservationBatchUseCase(
      observations,
      states,
      inventory,
      { generate: () => crypto.randomUUID() },
      { evaluate: () => Promise.reject(new Error('alerting unavailable')) },
      { error: (details) => errors.push(details) },
    );
    await expect(
      recorder.execute('company-1', [
        {
          equipmentId: 'equipment-1',
          metricType: 'packet_loss',
          source: 'test',
          timestamp: baseTime,
          unit: 'percent',
          value: 100,
        },
      ]),
    ).resolves.toBeUndefined();
    expect(
      database.connection.prepare('SELECT COUNT(*) AS count FROM monitoring_observations').get(),
    ).toEqual({ count: 1 });
    expect(
      database.connection.prepare('SELECT status FROM monitoring_current_states').get(),
    ).toEqual({ status: 'DOWN' });
    expect(errors).toHaveLength(1);
  });
});
