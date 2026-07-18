import type { Migration } from '../migration/migration.js';

export const monitoringWorkerMigration: Migration = {
  name: 'monitoring-worker',
  version: 15,
  sql: `
    CREATE TABLE work_leases_with_monitoring (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning', 'monitoring')),
      work_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
      acquired_at TEXT NOT NULL,
      renewed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (role, work_id)
    );
    INSERT INTO work_leases_with_monitoring
      (role, work_id, owner_id, fencing_token, acquired_at, renewed_at, expires_at)
      SELECT role, work_id, owner_id, fencing_token, acquired_at, renewed_at, expires_at
      FROM work_leases;
    DROP TABLE work_leases;
    ALTER TABLE work_leases_with_monitoring RENAME TO work_leases;
    CREATE INDEX work_leases_expiration_idx ON work_leases(role, expires_at, work_id);

    CREATE TABLE worker_statistics_with_monitoring (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning', 'monitoring')),
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
    INSERT INTO worker_statistics_with_monitoring
      (role, worker_id, started_at, stopped_at, heartbeat_at, last_success_at,
       last_error_at, last_error, processed_count, failed_count, retry_count,
       skipped_count, lease_lost_count)
      SELECT role, worker_id, started_at, stopped_at, heartbeat_at, last_success_at,
             last_error_at, last_error, processed_count, failed_count, retry_count,
             skipped_count, lease_lost_count
      FROM worker_statistics;
    DROP TABLE worker_statistics;
    ALTER TABLE worker_statistics_with_monitoring RENAME TO worker_statistics;
    CREATE INDEX worker_statistics_heartbeat_idx ON worker_statistics(heartbeat_at, role);
  `,
};
