import type { Migration } from '../migration/migration.js';

export const provisioningMigration: Migration = {
  name: 'provisioning',
  version: 5,
  sql: `
    CREATE TABLE provisioning_operations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'manual_review')
      ),
      router_id TEXT NOT NULL,
      ip_address_id TEXT,
      service_address_id TEXT,
      requested_by TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
      max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      next_attempt_at TEXT,
      UNIQUE (company_id, id),
      UNIQUE (company_id, service_id, idempotency_key),
      FOREIGN KEY (company_id, service_id) REFERENCES client_services(company_id, id)
    );
    CREATE UNIQUE INDEX provisioning_non_terminal_unique
      ON provisioning_operations(company_id, service_id, operation_type)
      WHERE status IN ('queued', 'running', 'failed');
    CREATE INDEX provisioning_claim_idx
      ON provisioning_operations(company_id, status, next_attempt_at, created_at);
    CREATE INDEX provisioning_service_created_idx
      ON provisioning_operations(service_id, created_at DESC);
  `,
};
