import type { Migration } from '../migration/migration.js';

export const monitoringMigration: Migration = {
  name: 'monitoring',
  version: 13,
  sql: `
    CREATE TABLE monitoring_observations (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX monitoring_observations_equipment_type_time_idx
      ON monitoring_observations(equipment_id, metric_type, occurred_at DESC);

    CREATE TABLE monitoring_current_states (
      equipment_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_seen_at TEXT,
      last_latency_ms REAL,
      uptime_seconds INTEGER
    );
  `,
};
