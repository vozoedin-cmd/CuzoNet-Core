import type { Migration } from '../migration/migration.js';

export const outboxIdempotencyMigration: Migration = {
  name: 'outbox-idempotency',
  version: 6,
  sql: `
    CREATE TABLE outbox_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT NOT NULL,
      published_at TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX outbox_unpublished_idx ON outbox_events(published_at, occurred_at, id);
    CREATE INDEX outbox_aggregate_idx ON outbox_events(aggregate_type, aggregate_id, occurred_at);

    CREATE TABLE event_deliveries (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TEXT,
      processed_at TEXT,
      last_error TEXT,
      FOREIGN KEY (event_id) REFERENCES outbox_events(id) ON DELETE CASCADE,
      UNIQUE (event_id, consumer_name)
    );
    CREATE INDEX event_deliveries_retry_idx
      ON event_deliveries(status, next_attempt_at, event_id);

    CREATE TABLE idempotency_keys (
      id TEXT PRIMARY KEY,
      api_client_id TEXT NOT NULL,
      request_method TEXT NOT NULL,
      request_path TEXT NOT NULL,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
      response_status INTEGER,
      response_body TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      expires_at TEXT NOT NULL,
      UNIQUE (api_client_id, request_method, request_path, key)
    );
    CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys(expires_at);
  `,
};
