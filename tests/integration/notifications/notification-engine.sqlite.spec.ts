import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Notification } from '../../../backend/domain/notifications/notification.js';
import { NotificationAttempt } from '../../../backend/domain/notifications/notification-attempt.js';
import { NotificationDestination } from '../../../backend/domain/notifications/notification-destination.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { migrations } from '../../../backend/infrastructure/database/sqlite/migration/migration-registry.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { SqliteNotificationAttemptRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-attempt.repository.js';
import { SqliteNotificationDestinationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-destination.repository.js';
import { SqliteNotificationEventReceiptRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-event-receipt.repository.js';
import { SqliteNotificationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification.repository.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function createNotification(
  id = 'notification-1',
  eventId = 'event-1',
  destinationId = 'destination-1',
) {
  return Notification.create({
    channel: 'webhook',
    companyId: 'company-1',
    createdAt: now,
    destinationId,
    id,
    incidentId: 'incident-1',
    maxAttempts: 5,
    payload: {
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      eventId,
      eventType: 'IncidentOpened.v1',
      incidentId: 'incident-1',
      occurredAt: now.toISOString(),
      ruleId: 'rule-1',
      severity: 'critical',
    },
    priority: 'urgent',
    scheduledAt: now,
    sourceEventId: eventId,
    sourceEventType: 'incident_opened',
    templateCode: 'incident-opened',
  });
}

function destination(
  id = 'destination-1',
  companyId = 'company-1',
  overrides: Partial<Parameters<typeof NotificationDestination.create>[0]> = {},
) {
  return NotificationDestination.create({
    channel: 'webhook',
    companyId,
    configurationReference: 'WEBHOOK_OPERATIONS',
    createdAt: now,
    enabled: true,
    eventTypes: ['incident_opened'],
    id,
    minimumSeverity: 'warning',
    name: `Operations ${id}`,
    updatedAt: now,
    ...overrides,
  });
}

describe('Notification Engine SQLite integration', () => {
  let database: SqliteDatabase;
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-notifications-'));
    path = join(directory, 'notifications.sqlite');
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path });
    new MigrationRunner(database.connection, { now: () => now }).migrate();
    seedPrerequisites(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('migrates from version 17, preserves data and creates the expected tables and indexes', async () => {
    await database.close();
    rmSync(path, { force: true });
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path });
    applyThroughVersion17(database);
    database.connection
      .prepare(
        `INSERT INTO companies (id, legal_name, display_name, currency_code, timezone, status, created_at)
       VALUES ('preserved-company', 'Preserved', 'Preserved', 'GTQ', 'UTC', 'active', ?)`,
      )
      .run(now.toISOString());
    new MigrationRunner(database.connection, { now: () => now }).migrate();

    expect(new MigrationRunner(database.connection).currentVersion()).toBe(22);
    expect(
      database.connection.prepare('SELECT id FROM companies WHERE id = ?').get('preserved-company'),
    ).toEqual({ id: 'preserved-company' });
    const tables = database.connection
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'notification_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(tables.map((row) => row.name)).toEqual([
      'notification_attempts',
      'notification_destinations',
      'notification_event_receipts',
      'notifications',
    ]);
    expect(
      database.connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='notifications_due_idx'",
        )
        .get(),
    ).toBeDefined();
  });

  it('persists tenant-aware destinations and enforces unique company/name', async () => {
    const repository = new SqliteNotificationDestinationRepository(database.session);
    await repository.save(destination());
    await repository.save(destination('destination-2', 'company-2'));
    expect(await repository.list('company-1')).toHaveLength(1);
    expect(await repository.findById('company-2', 'destination-1')).toBeNull();
    await expect(
      repository.save(
        destination('destination-3', 'company-1', { name: 'Operations destination-1' }),
      ),
    ).rejects.toThrow();
    expect(await repository.delete('company-2', 'destination-1')).toBe(false);
    expect(await repository.delete('company-1', 'destination-1')).toBe(true);
  });

  it('persists notifications, nullable fields, filters and idempotency', async () => {
    const repository = new SqliteNotificationRepository(database.session);
    await repository.save(createNotification());
    await repository.save(createNotification('notification-2', 'event-2', 'destination-2'));
    expect(
      await repository.list('company-1', { destinationId: 'destination-1', limit: 1 }),
    ).toHaveLength(1);
    expect(await repository.findById('company-2', 'notification-1')).toBeNull();
    const stored = await repository.findById('company-1', 'notification-1');
    expect(stored?.props.sentAt).toBeUndefined();
    await expect(repository.save(createNotification('duplicate-id'))).rejects.toThrow();
  });

  it('claims only once across two connections and recovers an expired lease', async () => {
    const primary = new SqliteNotificationRepository(database.session);
    await primary.save(createNotification());
    const secondaryDatabase = new SqliteDatabase({ busyTimeoutMs: 2_500, path });
    const secondary = new SqliteNotificationRepository(secondaryDatabase.session);
    const [first, second] = await Promise.all([
      primary.claimNextPending({ leaseDurationSeconds: 60, now, workerId: 'worker-a' }),
      secondary.claimNextPending({ leaseDurationSeconds: 60, now, workerId: 'worker-b' }),
    ]);
    expect([first, second].filter((value) => value !== null)).toHaveLength(1);
    const recovered = await secondary.claimNextPending({
      leaseDurationSeconds: 60,
      now: new Date(now.getTime() + 60_000),
      workerId: 'worker-b',
    });
    expect(recovered?.props.processingWorkerId).toBe('worker-b');
    await secondaryDatabase.close();
  });

  it('persists ordered unique attempts and event receipts', async () => {
    const notifications = new SqliteNotificationRepository(database.session);
    const attempts = new SqliteNotificationAttemptRepository(database.session);
    const receipts = new SqliteNotificationEventReceiptRepository(database.session);
    await notifications.save(createNotification());
    const first = NotificationAttempt.start({
      attemptNumber: 1,
      id: 'attempt-1',
      notificationId: 'notification-1',
      startedAt: now,
    });
    first.complete({
      completedAt: now,
      retryAt: new Date(now.getTime() + 30_000),
      status: 'retrying',
    });
    await attempts.save(first);
    await expect(
      attempts.save(
        NotificationAttempt.start({
          attemptNumber: 1,
          id: 'attempt-duplicate',
          notificationId: 'notification-1',
          startedAt: now,
        }),
      ),
    ).rejects.toThrow();
    expect((await attempts.findByNotificationId('notification-1'))[0]?.props.retryAt).toBeDefined();
    await receipts.save({
      companyId: 'company-1',
      createdNotifications: 1,
      eventId: 'event-1',
      eventType: 'IncidentOpened.v1',
      processedAt: now,
      status: 'processed',
    });
    await receipts.save({
      companyId: 'company-1',
      createdNotifications: 99,
      eventId: 'event-1',
      eventType: 'IncidentOpened.v1',
      processedAt: now,
      status: 'processed',
    });
    expect((await receipts.findByEventId('event-1'))?.createdNotifications).toBe(1);
  });

  it('rolls back notification creation through the existing UnitOfWork', async () => {
    const repository = new SqliteNotificationRepository(database.session);
    const unitOfWork = new SqliteUnitOfWork(database.session);
    await expect(
      unitOfWork.execute(async () => {
        await repository.save(createNotification());
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await repository.findById('company-1', 'notification-1')).toBeNull();
  });
});

function seedPrerequisites(database: SqliteDatabase): void {
  const iso = now.toISOString();
  const company = database.connection.prepare(
    `INSERT INTO companies (id, legal_name, display_name, currency_code, timezone, status, created_at)
     VALUES (?, ?, ?, 'GTQ', 'UTC', 'active', ?)`,
  );
  company.run('company-1', 'Company One', 'Company One', iso);
  company.run('company-2', 'Company Two', 'Company Two', iso);
  database.connection
    .prepare(
      `INSERT INTO network_assets (id, company_id, asset_type, role, status, capabilities, acquired_on)
     VALUES ('equipment-1', 'company-1', 'router', 'edge', 'active', '[]', ?)`,
    )
    .run(iso);
  database.connection
    .prepare(
      `INSERT INTO alert_rules (
      id, company_id, code, name, enabled, severity, condition_type, metric_type,
      operator, threshold, expected_status, duration_seconds, recovery_duration_seconds,
      created_at, updated_at
    ) VALUES ('rule-1', 'company-1', 'equipment-down', 'Equipment down', 1, 'critical',
      'equipment_status', NULL, 'equals', NULL, 'DOWN', 30, 30, ?, ?)`,
    )
    .run(iso, iso);
  database.connection
    .prepare(
      `INSERT INTO incidents (
      id, company_id, rule_id, equipment_id, status, severity, title, correlation_key,
      opened_at, acknowledged_at, acknowledged_by, resolved_at, last_evaluated_at,
      last_triggered_at, duration_seconds, created_at, updated_at
    ) VALUES ('incident-1', 'company-1', 'rule-1', 'equipment-1', 'open', 'critical',
      'Equipment down', 'company-1:rule-1:equipment-1', ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?)`,
    )
    .run(iso, iso, iso, iso, iso);
  const outbox = database.connection.prepare(
    `INSERT INTO outbox_events (
      id, company_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
      occurred_at, correlation_id, causation_id, published_at
    ) VALUES (?, 'company-1', 'IncidentOpened.v1', 1, 'Incident', 'incident-1', '{}', ?, ?, ?, NULL)`,
  );
  outbox.run('event-1', iso, 'correlation-1', 'cause-1');
  outbox.run('event-2', iso, 'correlation-2', 'cause-2');
}

function applyThroughVersion17(database: SqliteDatabase): void {
  database.connection.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  for (const migration of migrations.filter((item) => item.version <= 17)) {
    database.connection.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.sql
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean))
        database.connection.exec(statement);
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      database.connection
        .prepare(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        )
        .run(migration.version, migration.name, checksum, now.toISOString());
      database.connection.exec('COMMIT');
    } catch (error) {
      if (database.connection.inTransaction) database.connection.exec('ROLLBACK');
      throw error;
    }
  }
}
