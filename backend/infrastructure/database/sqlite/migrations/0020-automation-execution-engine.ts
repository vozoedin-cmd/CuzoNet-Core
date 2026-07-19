import type { Migration } from '../migration/migration.js';

export const automationExecutionEngineMigration: Migration = {
  name: 'automation-execution-engine',
  version: 20,
  sql: `
    PRAGMA foreign_keys = OFF;

    ALTER TABLE automation_executions RENAME TO legacy_automation_executions;

    DROP INDEX IF EXISTS automation_executions_rule_idx;
    DROP INDEX IF EXISTS automation_executions_event_idx;
    DROP INDEX IF EXISTS automation_executions_status_idx;
    DROP INDEX IF EXISTS automation_executions_created_idx;

    CREATE TABLE automation_executions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_snapshot_json TEXT NOT NULL,
      event_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'retrying', 'succeeded', 'failed', 'cancelled')),
      attempt_count INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      next_attempt_at TEXT,
      processing_started_at TEXT,
      processing_worker_id TEXT,
      processing_lease_until TEXT,
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      provider_execution_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, event_id, rule_id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE automation_attempts (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      response_code INTEGER,
      error_code TEXT,
      error_message TEXT,
      provider_execution_id TEXT,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (execution_id, attempt_number),
      FOREIGN KEY (execution_id) REFERENCES automation_executions(id) ON DELETE CASCADE
    );

    CREATE INDEX automation_executions_rule_idx ON automation_executions(company_id, rule_id);
    CREATE INDEX automation_executions_event_idx ON automation_executions(company_id, event_id);
    CREATE INDEX automation_executions_status_idx ON automation_executions(company_id, status, next_attempt_at);
    CREATE INDEX automation_executions_created_idx ON automation_executions(company_id, created_at DESC);

    INSERT INTO automation_executions (
      id, company_id, rule_id, event_id, event_type, action_type,
      action_snapshot_json, event_snapshot_json, status, attempt_count,
      max_attempts, next_attempt_at, processing_started_at, processing_worker_id,
      processing_lease_until, started_at, completed_at, cancelled_at,
      last_error_code, last_error_message, provider_execution_id, created_at, updated_at
    )
    SELECT
      l.id,
      l.company_id,
      l.rule_id,
      l.event_id,
      COALESCE((SELECT event_type FROM outbox_events WHERE id = l.event_id LIMIT 1), 'LegacyAutomationEvent.v1'),
      'request_service_reactivation',
      l.action_results,
      '{}',
      CASE l.status
        WHEN 'action_requested' THEN 'succeeded'
        WHEN 'action_rejected' THEN 'failed'
        WHEN 'action_pending' THEN 'failed'
        WHEN 'failed' THEN 'failed'
        ELSE 'failed'
      END,
      1,
      1,
      NULL,
      NULL,
      NULL,
      NULL,
      l.started_at,
      l.completed_at,
      NULL,
      CASE l.status
        WHEN 'action_requested' THEN NULL
        WHEN 'action_rejected' THEN 'LEGACY_ACTION_REJECTED'
        WHEN 'action_pending' THEN 'LEGACY_EXECUTION_NOT_RESUMABLE'
        WHEN 'failed' THEN COALESCE(l.error_code, 'LEGACY_EXECUTION')
        ELSE 'LEGACY_EXECUTION_UNMAPPABLE'
      END,
      l.error_message,
      NULL,
      l.started_at,
      COALESCE(l.completed_at, l.started_at)
    FROM legacy_automation_executions l
    WHERE l.status != 'evaluated_no_match';

    PRAGMA foreign_keys = ON;
  `,
};
