
import type { Database } from 'better-sqlite3';
import type { NotificationRepository, NotificationIdempotencyPort } from '../../application/ports/notifications/repositories.js';
import { Notification, type NotificationDeliveryProps, type DeliveryAttemptProps } from '../../domain/notifications/notification.js';
import type { NotificationChannel, NotificationStatus, DeliveryStatus, TemplateVariables } from '../../domain/notifications/types.js';

export class SqliteNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  public async save(notification: Notification): Promise<void> {
    const n = notification.props;
    
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO notifications (id, company_id, template_id, template_version_id, variables_payload, status, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status
      `).run(n.id, n.companyId, n.templateId, n.templateVersionId, JSON.stringify(n.variables), n.status, n.idempotencyKey || null, n.createdAt.toISOString());

      const delStmt = this.db.prepare(`
        INSERT INTO notification_deliveries (id, notification_id, recipient_id, address, channel, status, attempt_count, next_attempt_at, claim_token, claim_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          attempt_count = excluded.attempt_count,
          next_attempt_at = excluded.next_attempt_at,
          claim_token = excluded.claim_token,
          claim_expires_at = excluded.claim_expires_at
      `);

      const attStmt = this.db.prepare(`
        INSERT INTO notification_delivery_attempts (id, delivery_id, occurred_at, error_code, error_message)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);

      for (const d of n.deliveries) {
        delStmt.run(
          d.id, n.id, d.recipient.recipientId || null, d.recipient.address, d.channel, d.status, d.attemptCount,
          d.nextAttemptAt ? d.nextAttemptAt.toISOString() : null,
          d.claimToken || null,
          d.claimExpiresAt ? d.claimExpiresAt.toISOString() : null
        );

        for (const a of d.attempts) {
          attStmt.run(a.id, d.id, a.occurredAt.toISOString(), a.error?.code || null, a.error?.message || null);
        }
      }
    })();
  }

  public async findById(id: string): Promise<Notification | null> {
    const row = this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;
    
    const dRows = this.db.prepare('SELECT * FROM notification_deliveries WHERE notification_id = ?').all(id) as Record<string, unknown>[];
    
    const deliveries: NotificationDeliveryProps[] = dRows.map(dRow => {
      const aRows = this.db.prepare('SELECT * FROM notification_delivery_attempts WHERE delivery_id = ? ORDER BY occurred_at ASC').all(dRow.id as string) as Record<string, unknown>[];
      const attempts: DeliveryAttemptProps[] = aRows.map(aRow => ({
        id: aRow.id as string,
        occurredAt: new Date(aRow.occurred_at as string),
        ...(aRow.error_code ? { error: { code: aRow.error_code as string, message: aRow.error_message as string, sanitized: true } } : {})
      }));

      return {
        id: dRow.id as string,
        recipient: { recipientId: dRow.recipient_id as string, address: dRow.address as string },
        channel: dRow.channel as NotificationChannel,
        status: dRow.status as DeliveryStatus,
        attemptCount: dRow.attempt_count as number,
        ...(dRow.next_attempt_at ? { nextAttemptAt: new Date(dRow.next_attempt_at as string) } : {}),
        ...(dRow.claim_token ? { claimToken: dRow.claim_token as string } : {}),
        ...(dRow.claim_expires_at ? { claimExpiresAt: new Date(dRow.claim_expires_at as string) } : {}),
        attempts
      };
    });

    return Notification.reconstitute({
      id: row.id as string,
      companyId: row.company_id as string,
      templateId: row.template_id as string,
      templateVersionId: row.template_version_id as string,
      variables: JSON.parse(row.variables_payload as string) as TemplateVariables,
      status: row.status as NotificationStatus,
      ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key as string } : {}),
      createdAt: new Date(row.created_at as string),
      deliveries
    });
  }
}

export class SqliteNotificationIdempotency implements NotificationIdempotencyPort {
  constructor(private readonly db: Database) {}

  public async checkAndLock(key: string): Promise<boolean> {
    try {
      // Create table explicitly if missing for idempotency general or rely on the unique index in notifications
      const existing = this.db.prepare('SELECT 1 FROM notifications WHERE idempotency_key = ?').get(key);
      return existing === undefined;
    } catch {
      return false;
    }
  }
}
