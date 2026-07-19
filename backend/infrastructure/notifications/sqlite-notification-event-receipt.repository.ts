import type {
  NotificationEventReceipt,
  NotificationEventReceiptRepository,
} from '../../application/ports/notifications/repositories.js';
import type { NotificationEventReceiptTable } from '../database/sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';

export class SqliteNotificationEventReceiptRepository implements NotificationEventReceiptRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public findByEventId(eventId: string): Promise<NotificationEventReceipt | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('notification_event_receipts')
        .selectAll()
        .where('event_id', '=', eventId)
        .executeTakeFirst();
      return row === undefined ? null : fromRow(row);
    });
  }

  public save(receipt: NotificationEventReceipt): Promise<void> {
    const row: NotificationEventReceiptTable = {
      company_id: receipt.companyId,
      created_notifications: receipt.createdNotifications,
      event_id: receipt.eventId,
      event_type: receipt.eventType,
      last_error: receipt.lastError ?? null,
      processed_at: receipt.processedAt.toISOString(),
      status: receipt.status,
    };
    return this.session.execute(async (database) => {
      await database
        .insertInto('notification_event_receipts')
        .values(row)
        .onConflict((conflict) => conflict.column('event_id').doNothing())
        .execute();
    });
  }
}

function fromRow(row: NotificationEventReceiptTable): NotificationEventReceipt {
  return {
    companyId: row.company_id,
    createdNotifications: row.created_notifications,
    eventId: row.event_id,
    eventType: row.event_type,
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    processedAt: new Date(row.processed_at),
    status: row.status,
  };
}
