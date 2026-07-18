import type { Migration } from '../migration/migration.js';

export const alertingMigration: Migration = {
  name: 'alerting',
  version: 14,
  sql: `
    CREATE TABLE alert_policies (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      condition_payload TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL,
      severity TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX alerts_status_idx ON alerts(company_id, status);
    CREATE INDEX alerts_entity_idx ON alerts(entity_id, policy_id);

    CREATE TABLE alert_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      status TEXT NOT NULL,
      actor_id TEXT,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (alert_id) REFERENCES alerts(id)
    );
  `,
};
