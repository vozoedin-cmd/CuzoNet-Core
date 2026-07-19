import type { Migration } from '../migration/migration.js';

export const notificationEngineMigration: Migration = {
  name: 'notification-engine',
  version: 18,
  sql: `
    CREATE TABLE notification_destinations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('webhook', 'whatsapp', 'telegram', 'email')),
      enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
      configuration_reference TEXT NOT NULL,
      event_types_json TEXT NOT NULL,
      minimum_severity TEXT CHECK(minimum_severity IS NULL OR minimum_severity IN ('info', 'warning', 'minor', 'major', 'critical')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id),
      UNIQUE(company_id, name)
    );
    CREATE INDEX notification_destinations_company_idx
      ON notification_destinations(company_id, enabled, channel);

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      source_event_type TEXT NOT NULL CHECK(source_event_type IN ('incident_opened', 'incident_acknowledged', 'incident_resolved')),
      incident_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('webhook', 'whatsapp', 'telegram', 'email')),
      destination_id TEXT NOT NULL,
      template_code TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'sent', 'retrying', 'failed', 'cancelled', 'skipped')),
      payload_json TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      failed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
      max_attempts INTEGER NOT NULL CHECK(max_attempts >= 1),
      last_error TEXT,
      last_failure_retryable INTEGER CHECK(last_failure_retryable IS NULL OR last_failure_retryable IN (0, 1)),
      idempotency_key TEXT NOT NULL UNIQUE,
      processing_started_at TEXT,
      processing_worker_id TEXT,
      processing_lease_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id),
      FOREIGN KEY(incident_id) REFERENCES incidents(id),
      CHECK(
        (status = 'processing' AND processing_started_at IS NOT NULL AND processing_worker_id IS NOT NULL AND processing_lease_until IS NOT NULL)
        OR
        (status <> 'processing' AND processing_started_at IS NULL AND processing_worker_id IS NULL AND processing_lease_until IS NULL)
      )
    );
    CREATE INDEX notifications_due_idx ON notifications(status, scheduled_at, processing_lease_until, id);
    CREATE INDEX notifications_company_idx ON notifications(company_id, created_at DESC, id);
    CREATE INDEX notifications_incident_idx ON notifications(company_id, incident_id, created_at DESC);
    CREATE INDEX notifications_destination_idx ON notifications(company_id, destination_id, created_at DESC);
    CREATE INDEX notifications_source_event_idx ON notifications(source_event_id, company_id);
    CREATE INDEX notifications_attempts_idx ON notifications(status, attempts, max_attempts);

    CREATE TABLE notification_attempts (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('processing', 'sent', 'retrying', 'failed')),
      response_code INTEGER,
      error_code TEXT,
      error_message TEXT,
      retry_at TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      UNIQUE(notification_id, attempt_number)
    );
    CREATE INDEX notification_attempts_notification_idx
      ON notification_attempts(notification_id, attempt_number);

    CREATE TABLE notification_event_receipts (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      company_id TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      created_notifications INTEGER NOT NULL CHECK(created_notifications >= 0),
      status TEXT NOT NULL CHECK(status IN ('processed', 'failed')),
      last_error TEXT,
      FOREIGN KEY(event_id) REFERENCES outbox_events(id),
      FOREIGN KEY(company_id) REFERENCES companies(id)
    );
    CREATE INDEX notification_event_receipts_company_idx
      ON notification_event_receipts(company_id, processed_at DESC);

    CREATE TABLE work_leases_with_notifications (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning', 'monitoring', 'notification_outbox', 'notification_dispatch')),
      work_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
      acquired_at TEXT NOT NULL,
      renewed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (role, work_id)
    );
    INSERT INTO work_leases_with_notifications
      (role, work_id, owner_id, fencing_token, acquired_at, renewed_at, expires_at)
      SELECT role, work_id, owner_id, fencing_token, acquired_at, renewed_at, expires_at
      FROM work_leases;
    DROP TABLE work_leases;
    ALTER TABLE work_leases_with_notifications RENAME TO work_leases;
    CREATE INDEX work_leases_expiration_idx ON work_leases(role, expires_at, work_id);

    CREATE TABLE worker_statistics_with_notifications (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning', 'monitoring', 'notification_outbox', 'notification_dispatch')),
      worker_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      stopped_at TEXT,
      heartbeat_at TEXT NOT NULL,
      last_success_at TEXT,
      last_error_at TEXT,
      last_error TEXT,
      processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
      failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
      retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
      lease_lost_count INTEGER NOT NULL DEFAULT 0 CHECK (lease_lost_count >= 0),
      PRIMARY KEY (role, worker_id)
    );
    INSERT INTO worker_statistics_with_notifications
      (role, worker_id, started_at, stopped_at, heartbeat_at, last_success_at,
       last_error_at, last_error, processed_count, failed_count, retry_count,
       skipped_count, lease_lost_count)
      SELECT role, worker_id, started_at, stopped_at, heartbeat_at, last_success_at,
             last_error_at, last_error, processed_count, failed_count, retry_count,
             skipped_count, lease_lost_count
      FROM worker_statistics;
    DROP TABLE worker_statistics;
    ALTER TABLE worker_statistics_with_notifications RENAME TO worker_statistics;
    CREATE INDEX worker_statistics_heartbeat_idx ON worker_statistics(heartbeat_at, role);
  `,
};
