
import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      default_channel TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_templates_code ON notification_templates(company_id, code);

    CREATE TABLE IF NOT EXISTS notification_template_versions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      body_template TEXT NOT NULL,
      subject_template TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(template_id) REFERENCES notification_templates(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version_id TEXT NOT NULL,
      variables_payload TEXT NOT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idemp ON notifications(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      recipient_id TEXT,
      address TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      claim_token TEXT,
      claim_expires_at TEXT,
      FOREIGN KEY(notification_id) REFERENCES notifications(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notif_deliveries_status ON notification_deliveries(status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      FOREIGN KEY(delivery_id) REFERENCES notification_deliveries(id)
    );
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS notification_delivery_attempts;
    DROP TABLE IF EXISTS notification_deliveries;
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS notification_template_versions;
    DROP TABLE IF EXISTS notification_templates;
  `);
}
