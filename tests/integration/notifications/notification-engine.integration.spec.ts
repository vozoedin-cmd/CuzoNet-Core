import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { IdGenerator } from '../../../backend/application/ports/id-generator.port.js';
import type { NotificationCredentialProvider } from '../../../backend/application/ports/notifications/channels.js';
import { CreateNotificationsFromIncidentEventUseCase } from '../../../backend/application/use-cases/notifications/create-notifications-from-incident-event.usecase.js';
import { DispatchPendingNotificationUseCase } from '../../../backend/application/use-cases/notifications/dispatch-pending-notification.usecase.js';
import {
  NotificationChannelRegistry,
  NotificationDispatcher,
} from '../../../backend/application/use-cases/notifications/notification-dispatcher.js';
import { NotificationEventHandler } from '../../../backend/application/use-cases/notifications/notification-event-handler.js';
import { NotificationDestination } from '../../../backend/domain/notifications/notification-destination.js';
import { NotificationPolicy } from '../../../backend/domain/notifications/notification-policy.js';
import { NotificationRetryPolicy } from '../../../backend/domain/notifications/notification-retry-policy.js';
import { NotificationTemplateRenderer } from '../../../backend/domain/notifications/notification-template.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { FakeNotificationChannel } from '../../../backend/infrastructure/notifications/fake-channel-adapter.js';
import { SqliteNotificationAttemptRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-attempt.repository.js';
import { SqliteNotificationDestinationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-destination.repository.js';
import { SqliteNotificationEventReceiptRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-event-receipt.repository.js';
import { SqliteNotificationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification.repository.js';
import { NotificationDispatchWorker } from '../../../backend/infrastructure/workers/notification-dispatch-worker.js';
import {
  NotificationOutboxWorker,
  SqliteNotificationOutboxWorkRepository,
} from '../../../backend/infrastructure/workers/notification-outbox-worker.js';
import {
  OutboxWorker,
  SqliteOutboxWorkRepository,
} from '../../../backend/infrastructure/workers/outbox-worker.js';
import type { WorkerExecutionContext } from '../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

class SequenceIds implements IdGenerator {
  private value = 0;
  public generate(): string {
    this.value += 1;
    return `generated-${this.value}`;
  }
}

const credentials: NotificationCredentialProvider = {
  get: () => Promise.resolve({ channel: 'webhook', url: 'https://example.test/hook' }),
};

function context(role: WorkerRole): WorkerExecutionContext {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    async withLease(workId, work) {
      return {
        acquired: true,
        value: await work(controller.signal, {
          acquiredAt: new Date(0),
          expiresAt: new Date(60_000),
          fencingToken: 1,
          ownerId: 'test-worker',
          renewedAt: new Date(0),
          role,
          workId,
        }),
      };
    },
  };
}

describe('Notification Engine end-to-end without external services', () => {
  let database: SqliteDatabase;
  let now: Date;
  let clock: Clock;
  let ids: SequenceIds;
  let notifications: SqliteNotificationRepository;
  let attempts: SqliteNotificationAttemptRepository;
  let destinations: SqliteNotificationDestinationRepository;
  let receipts: SqliteNotificationEventReceiptRepository;
  let createNotifications: CreateNotificationsFromIncidentEventUseCase;

  beforeEach(async () => {
    now = new Date('2026-07-18T12:00:00.000Z');
    clock = { now: () => new Date(now) };
    ids = new SequenceIds();
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection, clock).migrate();
    seedIncidentEvent(database, now);
    notifications = new SqliteNotificationRepository(database.session);
    attempts = new SqliteNotificationAttemptRepository(database.session);
    destinations = new SqliteNotificationDestinationRepository(database.session);
    receipts = new SqliteNotificationEventReceiptRepository(database.session);
    createNotifications = new CreateNotificationsFromIncidentEventUseCase(
      notifications,
      destinations,
      receipts,
      new NotificationPolicy(),
      new SqliteUnitOfWork(database.session),
      ids,
      clock,
    );
    await destinations.save(destination('destination-1'));
  });

  afterEach(async () => database.close());

  it('routes IncidentOpened, creates pending once and records a receipt', async () => {
    const outbox = new OutboxWorker(new SqliteOutboxWorkRepository(database.session), clock);
    const consumer = new NotificationOutboxWorker(
      new SqliteNotificationOutboxWorkRepository(database.session),
      new NotificationEventHandler(createNotifications),
      clock,
    );
    expect(await outbox.runOnce(context(WorkerRole.Outbox))).toEqual({ outcome: 'processed' });
    expect(await consumer.runOnce(context(WorkerRole.NotificationOutbox))).toEqual({
      outcome: 'processed',
    });
    expect(await notifications.list('company-1')).toHaveLength(1);
    expect((await notifications.list('company-1'))[0]?.props.status).toBe('pending');
    expect((await receipts.findByEventId('event-1'))?.createdNotifications).toBe(1);

    database.connection
      .prepare(
        "UPDATE event_deliveries SET status='pending', processed_at=NULL WHERE event_id='event-1' AND consumer_name='notifications'",
      )
      .run();
    await consumer.runOnce(context(WorkerRole.NotificationOutbox));
    expect(await notifications.list('company-1')).toHaveLength(1);
  });

  it('isolates a malformed notification event and continues with the next Outbox event', async () => {
    const malformedAt = new Date(now.getTime() - 1_000).toISOString();
    database.connection
      .prepare(
        `INSERT INTO outbox_events (
          id, company_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
          occurred_at, correlation_id, causation_id, published_at
        ) VALUES ('event-malformed', 'company-1', 'IncidentOpened.v1', 1, 'Incident',
          'incident-1', '{}', ?, 'correlation-malformed', 'cause-malformed', NULL)`,
      )
      .run(malformedAt);
    const outbox = new OutboxWorker(new SqliteOutboxWorkRepository(database.session), clock);
    const consumer = new NotificationOutboxWorker(
      new SqliteNotificationOutboxWorkRepository(database.session),
      new NotificationEventHandler(createNotifications),
      clock,
    );
    await outbox.runOnce(context(WorkerRole.Outbox));
    await outbox.runOnce(context(WorkerRole.Outbox));
    expect(await consumer.runOnce(context(WorkerRole.NotificationOutbox))).toMatchObject({
      outcome: 'retried',
    });
    expect(await consumer.runOnce(context(WorkerRole.NotificationOutbox))).toEqual({
      outcome: 'processed',
    });
    expect(await notifications.list('company-1')).toHaveLength(1);
    expect(
      database.connection.prepare("SELECT status FROM incidents WHERE id='incident-1'").get(),
    ).toEqual({ status: 'open' });
  });
  it('creates one notification per eligible destination and filters disabled or severity', async () => {
    await destinations.save(destination('destination-2'));
    await destinations.save(destination('destination-disabled', { enabled: false }));
    await destinations.save(
      destination('destination-critical-only', { minimumSeverity: 'critical' }),
    );
    database.connection
      .prepare("UPDATE outbox_events SET published_at = ? WHERE id='event-1'")
      .run(now.toISOString());
    const envelope = readEnvelope(database);
    const result = await createNotifications.execute(envelope);
    expect(result.createdNotifications).toBe(3);
    const values = await notifications.list('company-1');
    expect(values).toHaveLength(3);
    expect(new Set(values.map((item) => item.props.idempotencyKey)).size).toBe(3);
  });

  it('marks a simulated webhook success as sent and records the attempt', async () => {
    await createNotifications.execute(readEnvelope(database));
    const channel = new FakeNotificationChannel('webhook', { responseCode: 204, type: 'success' });
    const worker = dispatchWorker(channel);
    await expect(worker.runOnce(context(WorkerRole.NotificationDispatch))).resolves.toEqual({
      outcome: 'processed',
    });
    const stored = (await notifications.list('company-1'))[0];
    expect(stored?.props.status).toBe('sent');
    expect(await attempts.findByNotificationId(stored?.props.id ?? '')).toHaveLength(1);
  });

  it('schedules HTTP 500 after 30 seconds, but fails HTTP 400 without retry', async () => {
    await createNotifications.execute(readEnvelope(database));
    await dispatchWorker(
      new FakeNotificationChannel('webhook', {
        errorCode: 'HTTP_500',
        errorMessage: 'HTTP 500',
        responseCode: 500,
        type: 'retryableFailure',
      }),
    ).runOnce(context(WorkerRole.NotificationDispatch));
    let stored = (await notifications.list('company-1'))[0];
    expect(stored?.props.status).toBe('retrying');
    expect(stored?.props.scheduledAt.toISOString()).toBe('2026-07-18T12:00:30.000Z');

    database.connection.prepare('DELETE FROM notification_attempts').run();
    database.connection.prepare('DELETE FROM notifications').run();
    database.connection.prepare('DELETE FROM notification_event_receipts').run();
    await createNotifications.execute(readEnvelope(database));
    await dispatchWorker(
      new FakeNotificationChannel('webhook', {
        errorCode: 'HTTP_400',
        errorMessage: 'HTTP 400',
        responseCode: 400,
        type: 'permanentFailure',
      }),
    ).runOnce(context(WorkerRole.NotificationDispatch));
    stored = (await notifications.list('company-1'))[0];
    expect(stored?.props.status).toBe('failed');
    expect(stored?.props.lastFailureRetryable).toBe(false);
  });

  it('stops retrying after the fifth simulated transient failure', async () => {
    await createNotifications.execute(readEnvelope(database));
    const worker = dispatchWorker(
      new FakeNotificationChannel('webhook', {
        errorCode: 'TIMEOUT',
        errorMessage: 'timeout',
        type: 'retryableFailure',
      }),
    );
    const expectedDelays = [30_000, 120_000, 600_000, 1_800_000];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await worker.runOnce(context(WorkerRole.NotificationDispatch));
      const stored = (await notifications.list('company-1'))[0];
      if (attempt < 4) {
        expect(stored?.props.status).toBe('retrying');
        now = new Date(now.getTime() + (expectedDelays[attempt] ?? 0));
      }
    }
    const stored = (await notifications.list('company-1'))[0];
    expect(stored?.props.status).toBe('failed');
    expect(stored?.props.attempts).toBe(5);
    expect(await attempts.findByNotificationId(stored?.props.id ?? '')).toHaveLength(5);
  });

  function dispatchWorker(channel: FakeNotificationChannel): NotificationDispatchWorker {
    const dispatcher = new NotificationDispatcher(
      new NotificationChannelRegistry([channel]),
      new NotificationTemplateRenderer(),
      credentials,
    );
    const useCase = new DispatchPendingNotificationUseCase(
      notifications,
      attempts,
      destinations,
      dispatcher,
      new NotificationRetryPolicy(),
      new SqliteUnitOfWork(database.session),
      ids,
      clock,
    );
    return new NotificationDispatchWorker(
      notifications,
      useCase,
      clock,
      { error: () => undefined },
      { batchSize: 1, leaseDurationSeconds: 60, workerId: 'dispatch-worker' },
    );
  }
});

function destination(
  id: string,
  overrides: Partial<Parameters<typeof NotificationDestination.create>[0]> = {},
) {
  const timestamp = new Date('2026-07-18T12:00:00.000Z');
  return NotificationDestination.create({
    channel: 'webhook',
    companyId: 'company-1',
    configurationReference: `WEBHOOK_${id.replaceAll('-', '_').toUpperCase()}`,
    createdAt: timestamp,
    enabled: true,
    eventTypes: ['incident_opened'],
    id,
    minimumSeverity: 'warning',
    name: id,
    updatedAt: timestamp,
    ...overrides,
  });
}

function readEnvelope(database: SqliteDatabase) {
  const row = database.connection
    .prepare('SELECT * FROM outbox_events WHERE id = ?')
    .get('event-1') as Record<string, unknown>;
  return {
    aggregateId: row.aggregate_id as string,
    aggregateType: row.aggregate_type as string,
    causationId: row.causation_id as string,
    companyId: row.company_id as string,
    correlationId: row.correlation_id as string,
    eventId: row.id as string,
    eventType: row.event_type as string,
    occurredAt: row.occurred_at as string,
    payload: JSON.parse(row.payload as string) as Record<string, unknown>,
    schemaVersion: row.schema_version as number,
  };
}

function seedIncidentEvent(database: SqliteDatabase, now: Date): void {
  const iso = now.toISOString();
  database.connection
    .prepare(
      `INSERT INTO companies (id, legal_name, display_name, currency_code, timezone, status, created_at)
     VALUES ('company-1', 'Company One', 'Company One', 'GTQ', 'UTC', 'active', ?)`,
    )
    .run(iso);
  database.connection
    .prepare(
      `INSERT INTO network_assets (id, company_id, asset_type, role, status, capabilities, acquired_on)
     VALUES ('equipment-1', 'company-1', 'router', 'edge', 'active', '[]', ?)`,
    )
    .run(iso);
  database.connection
    .prepare(
      `INSERT INTO alert_rules (
      id, company_id, code, name, enabled, severity, condition_type, metric_type, operator,
      threshold, expected_status, duration_seconds, recovery_duration_seconds, created_at, updated_at
    ) VALUES ('rule-1', 'company-1', 'equipment-down', 'Equipment down', 1, 'critical',
      'equipment_status', NULL, 'equals', NULL, 'DOWN', 30, 30, ?, ?)`,
    )
    .run(iso, iso);
  database.connection
    .prepare(
      `INSERT INTO incidents (
      id, company_id, rule_id, equipment_id, status, severity, title, correlation_key,
      opened_at, last_evaluated_at, last_triggered_at, created_at, updated_at
    ) VALUES ('incident-1', 'company-1', 'rule-1', 'equipment-1', 'open', 'critical',
      'Equipment down', 'company-1:rule-1:equipment-1', ?, ?, ?, ?, ?)`,
    )
    .run(iso, iso, iso, iso, iso);
  const payload = {
    companyId: 'company-1',
    equipmentId: 'equipment-1',
    eventId: 'event-1',
    incidentId: 'incident-1',
    occurredAt: iso,
    ruleId: 'rule-1',
    severity: 'critical',
  };
  database.connection
    .prepare(
      `INSERT INTO outbox_events (
      id, company_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
      occurred_at, correlation_id, causation_id, published_at
    ) VALUES ('event-1', 'company-1', 'IncidentOpened.v1', 1, 'Incident', 'incident-1', ?, ?,
      'correlation-1', 'cause-1', NULL)`,
    )
    .run(JSON.stringify(payload), iso);
}
