import type { Migration } from '../migration/migration.js';

export const provisioningEngineMigration: Migration = {
  name: 'provisioning-engine',
  version: 21,
  sql: `
    CREATE TABLE provisioning_requests (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_execution_id TEXT,
      idempotency_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      configuration_reference TEXT,
      input_hash TEXT NOT NULL,
      input_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
      ),
      attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
      max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
      next_attempt_at TEXT,
      processing_worker_id TEXT,
      processing_started_at TEXT,
      completed_at TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (attempt_count <= max_attempts)
    );

    CREATE UNIQUE INDEX provisioning_requests_idempotency_idx 
      ON provisioning_requests(company_id, idempotency_key);

    CREATE INDEX provisioning_requests_due_idx
      ON provisioning_requests(status, next_attempt_at);

    CREATE INDEX provisioning_requests_company_idx
      ON provisioning_requests(company_id, created_at);

    CREATE INDEX provisioning_requests_source_execution_idx
      ON provisioning_requests(source_execution_id)
      WHERE source_execution_id IS NOT NULL;

    CREATE TABLE provisioning_attempts (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      worker_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      outcome TEXT NOT NULL CHECK (
        outcome IN ('processing', 'succeeded', 'failed', 'retry_scheduled', 'cancelled')
      ),
      error_code TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      metadata_json TEXT,
      FOREIGN KEY(request_id) REFERENCES provisioning_requests(id)
    );

    CREATE UNIQUE INDEX provisioning_attempts_request_idx 
      ON provisioning_attempts(request_id, attempt_number);
  `,
};
