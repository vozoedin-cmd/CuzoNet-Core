import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitoring_observations (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_monitoring_obs_eq_type_time ON monitoring_observations(equipment_id, metric_type, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS monitoring_current_states (
      equipment_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_seen_at TEXT,
      last_latency_ms REAL,
      uptime_seconds INTEGER
    );
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS monitoring_current_states;
    DROP TABLE IF EXISTS monitoring_observations;
  `);
}
