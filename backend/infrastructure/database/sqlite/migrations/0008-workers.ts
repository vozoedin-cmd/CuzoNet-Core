import type { Migration } from '../migration/migration.js';

export const workersMigration: Migration = {
  name: 'workers',
  version: 8,
  sql: `
    CREATE TABLE work_leases (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning')),
      work_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
      acquired_at TEXT NOT NULL,
      renewed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (role, work_id)
    );
    CREATE INDEX work_leases_expiration_idx ON work_leases(role, expires_at, work_id);

    CREATE TABLE worker_statistics (
      role TEXT NOT NULL CHECK (role IN ('outbox', 'automation', 'provisioning')),
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
    CREATE INDEX worker_statistics_heartbeat_idx ON worker_statistics(heartbeat_at, role);
  `,
};
