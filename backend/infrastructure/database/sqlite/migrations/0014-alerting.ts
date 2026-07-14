
import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_policies (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      condition_payload TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alerts (
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
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity_id, policy_id);

    CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      status TEXT NOT NULL,
      actor_id TEXT,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY(alert_id) REFERENCES alerts(id)
    );
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS alert_history;
    DROP TABLE IF EXISTS alerts;
    DROP TABLE IF EXISTS alert_policies;
  `);
}
