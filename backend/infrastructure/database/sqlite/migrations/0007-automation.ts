import type { Migration } from '../migration/migration.js';

export const automationMigration: Migration = {
  name: 'automation',
  version: 7,
  sql: `
    CREATE TABLE automation_rules (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
      condition_definition TEXT NOT NULL,
      actions_definition TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version >= 1),
      priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 1000),
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at TEXT,
      updated_by TEXT,
      UNIQUE (company_id, id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX automation_rules_trigger_idx
      ON automation_rules(company_id, status, trigger_event_type, schema_version, priority DESC);
    CREATE INDEX automation_rules_name_idx ON automation_rules(company_id, name);

    CREATE TABLE automation_rule_versions (
      rule_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      trigger_event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      condition_definition TEXT NOT NULL,
      actions_definition TEXT NOT NULL,
      priority INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      PRIMARY KEY (rule_id, version),
      FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE
    );

    CREATE TABLE automation_executions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_version INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      context_id TEXT NOT NULL,
      matched INTEGER NOT NULL CHECK (matched IN (0, 1)),
      status TEXT NOT NULL,
      action_results TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (company_id, rule_id, rule_version, event_id, context_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (rule_id, rule_version) REFERENCES automation_rule_versions(rule_id, version),
      FOREIGN KEY (event_id) REFERENCES outbox_events(id)
    );
    CREATE INDEX automation_executions_rule_idx
      ON automation_executions(company_id, rule_id, started_at DESC);
    CREATE INDEX automation_executions_event_idx
      ON automation_executions(company_id, event_id);
    CREATE INDEX automation_executions_status_idx
      ON automation_executions(company_id, status, started_at);
  `,
};
