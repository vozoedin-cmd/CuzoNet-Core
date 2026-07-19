import type { NotificationAttemptRepository } from '../../application/ports/notifications/repositories.js';
import { NotificationAttempt } from '../../domain/notifications/notification-attempt.js';
import type { JsonValue } from '../../domain/notifications/types.js';
import type { NotificationAttemptTable } from '../database/sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';

export class SqliteNotificationAttemptRepository implements NotificationAttemptRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(attempt: NotificationAttempt): Promise<void> {
    const row = toRow(attempt);
    return this.session.execute(async (database) => {
      await database
        .insertInto('notification_attempts')
        .values(row)
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            completed_at: row.completed_at,
            error_code: row.error_code,
            error_message: row.error_message,
            metadata_json: row.metadata_json,
            response_code: row.response_code,
            retry_at: row.retry_at,
            status: row.status,
          }),
        )
        .execute();
    });
  }

  public findByNotificationId(notificationId: string): Promise<readonly NotificationAttempt[]> {
    return this.session.execute(async (database) => {
      const rows = await database
        .selectFrom('notification_attempts')
        .selectAll()
        .where('notification_id', '=', notificationId)
        .orderBy('attempt_number', 'asc')
        .execute();
      return rows.map(fromRow);
    });
  }
}

function toRow(attempt: NotificationAttempt): NotificationAttemptTable {
  const props = attempt.props;
  return {
    attempt_number: props.attemptNumber,
    completed_at: props.completedAt?.toISOString() ?? null,
    created_at: props.createdAt.toISOString(),
    error_code: props.errorCode ?? null,
    error_message: props.errorMessage ?? null,
    id: props.id,
    metadata_json: props.metadata === undefined ? null : JSON.stringify(props.metadata),
    notification_id: props.notificationId,
    response_code: props.responseCode ?? null,
    retry_at: props.retryAt?.toISOString() ?? null,
    started_at: props.startedAt.toISOString(),
    status: props.status,
  };
}

function fromRow(row: NotificationAttemptTable): NotificationAttempt {
  return NotificationAttempt.reconstitute({
    attemptNumber: row.attempt_number,
    ...(row.completed_at === null ? {} : { completedAt: new Date(row.completed_at) }),
    createdAt: new Date(row.created_at),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    id: row.id,
    ...(row.metadata_json === null
      ? {}
      : { metadata: JSON.parse(row.metadata_json) as Readonly<Record<string, JsonValue>> }),
    notificationId: row.notification_id,
    ...(row.response_code === null ? {} : { responseCode: row.response_code }),
    ...(row.retry_at === null ? {} : { retryAt: new Date(row.retry_at) }),
    startedAt: new Date(row.started_at),
    status: row.status,
  });
}
