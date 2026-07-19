import type { Migration } from '../migration/migration.js';

export const incidentAlertingMigration: Migration = {
  name: 'incident-alerting',
  version: 17,
  sql: `
    CREATE TABLE alert_rules (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'minor', 'major', 'critical')),
      condition_type TEXT NOT NULL CHECK(condition_type IN ('equipment_status', 'metric_threshold')),
      metric_type TEXT,
      operator TEXT NOT NULL CHECK(operator IN ('equals', 'greater_than')),
      threshold REAL,
      expected_status TEXT CHECK(expected_status IS NULL OR expected_status = 'DOWN'),
      duration_seconds INTEGER NOT NULL CHECK(duration_seconds > 0),
      recovery_duration_seconds INTEGER NOT NULL CHECK(recovery_duration_seconds > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(company_id, code),
      CHECK(
        (condition_type = 'equipment_status' AND operator = 'equals' AND expected_status IS NOT NULL
          AND metric_type IS NULL AND threshold IS NULL)
        OR
        (condition_type = 'metric_threshold' AND operator = 'greater_than' AND metric_type IS NOT NULL
          AND threshold IS NOT NULL AND expected_status IS NULL)
      )
    );
    CREATE INDEX alert_rules_company_enabled_idx ON alert_rules(company_id, enabled);

    CREATE TABLE incidents (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'acknowledged', 'resolved')),
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'minor', 'major', 'critical')),
      title TEXT NOT NULL,
      correlation_key TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      resolved_at TEXT,
      last_evaluated_at TEXT NOT NULL,
      last_triggered_at TEXT NOT NULL,
      duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (rule_id) REFERENCES alert_rules(id),
      FOREIGN KEY (equipment_id) REFERENCES network_assets(id)
    );
    CREATE INDEX incidents_company_status_idx ON incidents(company_id, status, updated_at DESC);
    CREATE INDEX incidents_equipment_idx ON incidents(company_id, equipment_id, opened_at DESC);
    CREATE INDEX incidents_rule_idx ON incidents(company_id, rule_id, opened_at DESC);
    CREATE INDEX incidents_correlation_idx ON incidents(company_id, correlation_key);
    CREATE UNIQUE INDEX incidents_active_correlation_uidx
      ON incidents(company_id, correlation_key)
      WHERE status IN ('open', 'acknowledged');

    CREATE TABLE incident_events (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN (
        'opened', 'condition_reconfirmed', 'acknowledged', 'resolved', 'reopened'
      )),
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX incident_events_incident_time_idx ON incident_events(incident_id, occurred_at, id);
    CREATE INDEX incident_events_company_time_idx ON incident_events(company_id, occurred_at DESC);

    CREATE TABLE alert_evaluation_states (
      company_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      condition_started_at TEXT,
      recovery_started_at TEXT,
      last_observed_at TEXT,
      last_condition_matched INTEGER NOT NULL CHECK(last_condition_matched IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(company_id, rule_id, equipment_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (rule_id) REFERENCES alert_rules(id),
      FOREIGN KEY (equipment_id) REFERENCES network_assets(id)
    );
    CREATE INDEX alert_evaluation_states_company_idx ON alert_evaluation_states(company_id, updated_at);
    CREATE INDEX alert_evaluation_states_equipment_idx ON alert_evaluation_states(company_id, equipment_id);
  `,
};
