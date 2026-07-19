import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { NotificationsController } from '../../../backend/api/notifications/notifications.controller.js';
import { createNotificationsRouter } from '../../../backend/api/notifications/notifications.routes.js';
import { CancelNotificationUseCase } from '../../../backend/application/use-cases/notifications/cancel-notification.usecase.js';
import { GetNotificationUseCase } from '../../../backend/application/use-cases/notifications/get-notification.usecase.js';
import { ListNotificationsUseCase } from '../../../backend/application/use-cases/notifications/list-notifications.usecase.js';
import {
  CreateNotificationDestinationUseCase,
  DeleteNotificationDestinationUseCase,
  ListNotificationDestinationsUseCase,
  UpdateNotificationDestinationUseCase,
} from '../../../backend/application/use-cases/notifications/manage-notification-destinations.usecase.js';
import { RetryNotificationUseCase } from '../../../backend/application/use-cases/notifications/retry-notification.usecase.js';
import { Notification } from '../../../backend/domain/notifications/notification.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteNotificationAttemptRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-attempt.repository.js';
import { SqliteNotificationDestinationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification-destination.repository.js';
import { SqliteNotificationRepository } from '../../../backend/infrastructure/notifications/sqlite-notification.repository.js';

const now = new Date('2026-07-18T12:00:00.000Z');

describe('Notifications API', () => {
  let database: SqliteDatabase;
  let notifications: SqliteNotificationRepository;
  let app: ReturnType<typeof createApp>;
  let nextId: number;

  beforeEach(async () => {
    nextId = 0;
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection, { now: () => now }).migrate();
    seed(database);
    notifications = new SqliteNotificationRepository(database.session);
    const attempts = new SqliteNotificationAttemptRepository(database.session);
    const destinations = new SqliteNotificationDestinationRepository(database.session);
    const clock = { now: () => new Date(now) };
    const ids = { generate: () => `destination-${++nextId}` };
    const controller = new NotificationsController({
      cancelNotification: new CancelNotificationUseCase(notifications, clock),
      createDestination: new CreateNotificationDestinationUseCase(destinations, ids, clock),
      deleteDestination: new DeleteNotificationDestinationUseCase(destinations),
      getNotification: new GetNotificationUseCase(notifications, attempts),
      listDestinations: new ListNotificationDestinationsUseCase(destinations),
      listNotifications: new ListNotificationsUseCase(notifications),
      retryNotification: new RetryNotificationUseCase(notifications, clock),
      updateDestination: new UpdateNotificationDestinationUseCase(destinations, clock),
    });
    app = createApp({ notificationsRouter: createNotificationsRouter(controller) });
    await notifications.save(notification('notification-pending', 'event-pending'));
    const retrying = notification('notification-retrying', 'event-retrying');
    retrying.claim(now, 'worker', new Date(now.getTime() + 60_000));
    retrying.beginAttempt(now, 'worker');
    retrying.markRetrying('timeout', new Date(now.getTime() + 30_000), now, 'worker');
    await notifications.save(retrying);
  });

  afterEach(async () => database.close());

  it('supports destination CRUD without accepting or returning secrets', async () => {
    const body = {
      channel: 'webhook',
      companyId: 'company-1',
      configurationReference: 'WEBHOOK_OPERATIONS',
      enabled: true,
      eventTypes: ['incident_opened'],
      minimumSeverity: 'warning',
      name: 'Operations',
    };
    const created = await request(app)
      .post('/api/v1/notification-destinations')
      .set('X-Correlation-Id', 'notification-api-test')
      .send(body)
      .expect(201);
    expect(created.body.configurationReference).toBe('WEBHOOK_OPERATIONS');
    expect(JSON.stringify(created.body)).not.toMatch(/bearer|password|token/i);

    await request(app)
      .put(`/api/v1/notification-destinations/${created.body.id as string}`)
      .send({ ...body, enabled: false, name: 'Operations disabled' })
      .expect(200);
    const listed = await request(app)
      .get('/api/v1/notification-destinations')
      .query({ companyId: 'company-1' })
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    await request(app)
      .delete(`/api/v1/notification-destinations/${created.body.id as string}`)
      .query({ companyId: 'company-1' })
      .expect(204);

    await request(app)
      .post('/api/v1/notification-destinations')
      .send({ ...body, bearerToken: 'must-not-be-accepted' })
      .expect(422);
  });

  it('lists, gets, retries and cancels with tenancy and correlation-aware errors', async () => {
    const listed = await request(app)
      .get('/api/v1/notifications')
      .query({ companyId: 'company-1', status: 'pending' })
      .expect(200);
    expect(listed.body.items).toHaveLength(1);

    const fetched = await request(app)
      .get('/api/v1/notifications/notification-pending')
      .query({ companyId: 'company-1' })
      .expect(200);
    expect(fetched.body.attempts).toEqual([]);
    expect(JSON.stringify(fetched.body)).not.toMatch(/processingWorkerId|bearerToken/i);

    await request(app)
      .post('/api/v1/notifications/notification-retrying/retry')
      .send({ companyId: 'company-1' })
      .expect(200)
      .expect((response) => expect(response.body.scheduledAt).toBe(now.toISOString()));
    await request(app)
      .post('/api/v1/notifications/notification-pending/cancel')
      .send({ companyId: 'company-1', reason: 'operator request' })
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('cancelled'));

    const hidden = await request(app)
      .get('/api/v1/notifications/notification-pending')
      .set('X-Correlation-Id', 'tenant-hidden')
      .query({ companyId: 'company-2' })
      .expect(404);
    expect(hidden.body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      correlationId: 'tenant-hidden',
    });
  });
});

function notification(id: string, eventId: string): Notification {
  return Notification.create({
    channel: 'webhook',
    companyId: 'company-1',
    createdAt: now,
    destinationId: 'destination-fixture',
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

function seed(database: SqliteDatabase): void {
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
}
