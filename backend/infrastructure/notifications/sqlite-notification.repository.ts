import { sql } from 'kysely';

import type {
  ClaimPendingNotificationInput,
  NotificationListFilters,
  NotificationRepository,
} from '../../application/ports/notifications/repositories.js';
import { Notification } from '../../domain/notifications/notification.js';
import type { IncidentNotificationEvent } from '../../domain/notifications/types.js';
import type { NotificationTable } from '../database/sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';

export class SqliteNotificationRepository implements NotificationRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(notification: Notification): Promise<void> {
    const row = toRow(notification);
    return this.session.execute(async (database) => {
      await database
        .insertInto('notifications')
        .values(row)
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            attempts: row.attempts,
            failed_at: row.failed_at,
            last_error: row.last_error,
            last_failure_retryable: row.last_failure_retryable,
            processing_lease_until: row.processing_lease_until,
            processing_started_at: row.processing_started_at,
            processing_worker_id: row.processing_worker_id,
            scheduled_at: row.scheduled_at,
            sent_at: row.sent_at,
            status: row.status,
            updated_at: row.updated_at,
          }),
        )
        .execute();
    });
  }

  public findById(companyId: string, notificationId: string): Promise<Notification | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('notifications')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', notificationId)
        .executeTakeFirst();
      return row === undefined ? null : fromRow(row);
    });
  }

  public findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<Notification | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('notifications')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();
      return row === undefined ? null : fromRow(row);
    });
  }

  public list(
    companyId: string,
    filters: NotificationListFilters = {},
  ): Promise<readonly Notification[]> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('notifications')
        .selectAll()
        .where('company_id', '=', companyId);
      if (filters.channel !== undefined) query = query.where('channel', '=', filters.channel);
      if (filters.status !== undefined) query = query.where('status', '=', filters.status);
      if (filters.incidentId !== undefined)
        query = query.where('incident_id', '=', filters.incidentId);
      if (filters.destinationId !== undefined)
        query = query.where('destination_id', '=', filters.destinationId);
      if (filters.dateFrom !== undefined)
        query = query.where('created_at', '>=', filters.dateFrom.toISOString());
      if (filters.dateTo !== undefined)
        query = query.where('created_at', '<=', filters.dateTo.toISOString());
      const rows = await query
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(filters.limit ?? 100)
        .offset(filters.offset ?? 0)
        .execute();
      return rows.map(fromRow);
    });
  }

  public claimNextPending(input: ClaimPendingNotificationInput): Promise<Notification | null> {
    if (!Number.isInteger(input.leaseDurationSeconds) || input.leaseDurationSeconds < 1)
      throw new RangeError('leaseDurationSeconds debe ser mayor que cero.');
    return this.session.execute(async (database) => {
      const now = input.now.toISOString();
      const leaseUntil = new Date(
        input.now.getTime() + input.leaseDurationSeconds * 1_000,
      ).toISOString();
      const result = await sql<NotificationTable>`
        UPDATE notifications
        SET status = 'processing',
            processing_started_at = ${now},
            processing_worker_id = ${input.workerId},
            processing_lease_until = ${leaseUntil},
            updated_at = ${now}
        WHERE id = (
          SELECT id
          FROM notifications
          WHERE attempts < max_attempts
            AND (
              (status IN ('pending', 'retrying') AND scheduled_at <= ${now})
              OR
              (status = 'processing' AND processing_lease_until IS NOT NULL
                AND processing_lease_until <= ${now})
            )
          ORDER BY scheduled_at ASC, id ASC
          LIMIT 1
        )
        AND attempts < max_attempts
        AND (
          (status IN ('pending', 'retrying') AND scheduled_at <= ${now})
          OR
          (status = 'processing' AND processing_lease_until IS NOT NULL
            AND processing_lease_until <= ${now})
        )
        RETURNING *
      `.execute(database);
      const row = result.rows[0];
      return row === undefined ? null : fromRow(row);
    });
  }
}

function toRow(notification: Notification): NotificationTable {
  const props = notification.props;
  return {
    attempts: props.attempts,
    channel: props.channel,
    company_id: props.companyId,
    created_at: props.createdAt.toISOString(),
    destination_id: props.destinationId,
    failed_at: props.failedAt?.toISOString() ?? null,
    id: props.id,
    idempotency_key: props.idempotencyKey,
    incident_id: props.incidentId,
    last_error: props.lastError ?? null,
    last_failure_retryable:
      props.lastFailureRetryable === undefined ? null : props.lastFailureRetryable ? 1 : 0,
    max_attempts: props.maxAttempts,
    payload_json: JSON.stringify(props.payload),
    priority: props.priority,
    processing_lease_until: props.processingLeaseUntil?.toISOString() ?? null,
    processing_started_at: props.processingStartedAt?.toISOString() ?? null,
    processing_worker_id: props.processingWorkerId ?? null,
    scheduled_at: props.scheduledAt.toISOString(),
    sent_at: props.sentAt?.toISOString() ?? null,
    source_event_id: props.sourceEventId,
    source_event_type: props.sourceEventType,
    status: props.status,
    template_code: props.templateCode,
    updated_at: props.updatedAt.toISOString(),
  };
}

function fromRow(row: NotificationTable): Notification {
  return Notification.reconstitute({
    attempts: row.attempts,
    channel: row.channel,
    companyId: row.company_id,
    createdAt: new Date(row.created_at),
    destinationId: row.destination_id,
    ...(row.failed_at === null ? {} : { failedAt: new Date(row.failed_at) }),
    id: row.id,
    idempotencyKey: row.idempotency_key,
    incidentId: row.incident_id,
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    ...(row.last_failure_retryable === null
      ? {}
      : { lastFailureRetryable: row.last_failure_retryable === 1 }),
    maxAttempts: row.max_attempts,
    payload: JSON.parse(row.payload_json) as IncidentNotificationEvent,
    priority: row.priority,
    ...(row.processing_lease_until === null
      ? {}
      : { processingLeaseUntil: new Date(row.processing_lease_until) }),
    ...(row.processing_started_at === null
      ? {}
      : { processingStartedAt: new Date(row.processing_started_at) }),
    ...(row.processing_worker_id === null ? {} : { processingWorkerId: row.processing_worker_id }),
    scheduledAt: new Date(row.scheduled_at),
    ...(row.sent_at === null ? {} : { sentAt: new Date(row.sent_at) }),
    sourceEventId: row.source_event_id,
    sourceEventType: row.source_event_type,
    status: row.status,
    templateCode: row.template_code,
    updatedAt: new Date(row.updated_at),
  });
}
