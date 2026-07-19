import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AlertEvaluationState } from '../../../backend/domain/alerting/alert-evaluation-state.js';
import { Incident } from '../../../backend/domain/alerting/incident.js';
import { InstallDefaultAlertRulesUseCase } from '../../../backend/application/use-cases/alerting/install-default-alert-rules.usecase.js';
import { SqliteAlertEvaluationStateRepository } from '../../../backend/infrastructure/alerting/sqlite-alert-evaluation-state.repository.js';
import { SqliteAlertRuleRepository } from '../../../backend/infrastructure/alerting/sqlite-alert-rule.repository.js';
import { SqliteIncidentEventRepository } from '../../../backend/infrastructure/alerting/sqlite-incident-event.repository.js';
import { SqliteIncidentRepository } from '../../../backend/infrastructure/alerting/sqlite-incident.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function incident(id: string, correlationKey: string): Incident {
  return Incident.open({
    causationId: `cause-${id}`,
    companyId: 'company-1',
    correlationId: correlationKey,
    correlationKey,
    domainEventId: `domain-${id}`,
    equipmentId: 'equipment-1',
    eventId: `event-${id}`,
    id,
    openedAt: now,
    ruleId: 'rule-1',
    severity: 'critical',
    title: 'Equipment DOWN',
  });
}

describe('Incident Alerting SQLite integration', () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    database.connection
      .prepare(
        `INSERT INTO companies (
      id, legal_name, display_name, currency_code, timezone, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run('company-1', 'Company One', 'Company One', 'GTQ', 'UTC', now.toISOString());
    database.connection
      .prepare(
        `INSERT INTO companies (
      id, legal_name, display_name, currency_code, timezone, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run('company-2', 'Company Two', 'Company Two', 'GTQ', 'UTC', now.toISOString());
    database.connection
      .prepare(
        `INSERT INTO network_assets (
      id, company_id, asset_type, role, status, capabilities, acquired_on
    ) VALUES (?, ?, 'router', 'edge', 'active', '[]', ?)`,
      )
      .run('equipment-1', 'company-1', now.toISOString());
  });

  afterEach(async () => database.close());

  it('creates the complete version 18 schema while preserving legacy alerting', () => {
    const tables = database.connection
      .prepare(
        `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'alert_policies', 'alerts', 'alert_history', 'alert_rules', 'incidents',
        'incident_events', 'alert_evaluation_states'
      ) ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(tables.map(({ name }) => name)).toEqual([
      'alert_evaluation_states',
      'alert_history',
      'alert_policies',
      'alert_rules',
      'alerts',
      'incident_events',
      'incidents',
    ]);
    expect(new MigrationRunner(database.connection).currentVersion()).toBe(19);
  });

  it('installs default company rules idempotently with recovery windows', async () => {
    const repository = new SqliteAlertRuleRepository(database.connection);
    let nextId = 0;
    const installer = new InstallDefaultAlertRulesUseCase(
      repository,
      { generate: () => `rule-${++nextId}` },
      { now: () => now },
    );
    await installer.execute('company-1');
    await installer.execute('company-1');
    expect(await repository.listByCompany('company-1')).toHaveLength(3);
    expect(
      (await repository.findByCode('company-1', 'high-cpu'))?.props.recoveryDurationSeconds,
    ).toBe(120);
    expect(await repository.listByCompany('company-2')).toHaveLength(0);
  });

  it('persists tenant-scoped incidents, ordered events and evaluation state', async () => {
    const ruleRepository = new SqliteAlertRuleRepository(database.connection);
    await new InstallDefaultAlertRulesUseCase(
      ruleRepository,
      { generate: () => 'rule-1' },
      { now: () => now },
    ).execute('company-1');
    const incidentRepository = new SqliteIncidentRepository(database.connection);
    const eventRepository = new SqliteIncidentEventRepository(database.connection);
    const stateRepository = new SqliteAlertEvaluationStateRepository(database.connection);
    const aggregate = incident('incident-1', 'company-1:rule-1:equipment-1');
    const openedEvents = aggregate.pullIncidentEvents();
    aggregate.reconfirm('event-reconfirm', new Date(now.getTime() + 30_000), 100);
    await incidentRepository.save(aggregate);
    await eventRepository.append([...openedEvents, ...aggregate.pullIncidentEvents()]);
    const state = AlertEvaluationState.create({
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      ruleId: 'rule-1',
      updatedAt: now,
    });
    state.apply({
      decision: { type: 'trigger' },
      durationSeconds: 30,
      observedAt: now,
      recoveryDurationSeconds: 30,
    });
    await stateRepository.save(state);

    expect((await incidentRepository.findById('company-1', 'incident-1'))?.props.status).toBe(
      'open',
    );
    expect(await incidentRepository.findById('company-2', 'incident-1')).toBeNull();
    expect(
      (await eventRepository.listByIncident('company-1', 'incident-1')).map(
        ({ props }) => props.type,
      ),
    ).toEqual(['opened', 'condition_reconfirmed']);
    expect(
      (
        await stateRepository.find('company-1', 'rule-1', 'equipment-1')
      )?.props.conditionStartedAt?.toISOString(),
    ).toBe(now.toISOString());
    expect(await stateRepository.find('company-2', 'rule-1', 'equipment-1')).toBeNull();
  });

  it('enforces one active incident per company correlation key but permits a new resolved cycle', async () => {
    const ruleRepository = new SqliteAlertRuleRepository(database.connection);
    await new InstallDefaultAlertRulesUseCase(
      ruleRepository,
      { generate: () => 'rule-1' },
      { now: () => now },
    ).execute('company-1');
    const repository = new SqliteIncidentRepository(database.connection);
    const first = incident('incident-1', 'correlation-1');
    await repository.save(first);
    await expect(repository.save(incident('incident-2', 'correlation-1'))).rejects.toThrow();
    first.resolve(
      {
        causationId: 'cause',
        correlationId: 'correlation-1',
        domainEventId: 'domain-resolve',
        eventId: 'event-resolve',
      },
      new Date(now.getTime() + 60_000),
    );
    await repository.save(first);
    await expect(repository.save(incident('incident-2', 'correlation-1'))).resolves.toBeUndefined();
  });
});
