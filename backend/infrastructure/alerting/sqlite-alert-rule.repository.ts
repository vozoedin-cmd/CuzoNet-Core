import type { Database } from 'better-sqlite3';

import type { AlertRuleRepository } from '../../application/ports/alerting/incident-repositories.js';
import { AlertRule, type AlertRuleCondition } from '../../domain/alerting/alert-rule.js';
import type { AlertSeverity } from '../../domain/alerting/incident-types.js';

interface AlertRuleRow {
  code: string;
  company_id: string;
  condition_type: 'equipment_status' | 'metric_threshold';
  created_at: string;
  duration_seconds: number;
  enabled: number;
  expected_status: 'DOWN' | null;
  id: string;
  metric_type: string | null;
  name: string;
  operator: 'equals' | 'greater_than';
  recovery_duration_seconds: number;
  severity: AlertSeverity;
  threshold: number | null;
  updated_at: string;
}

export class SqliteAlertRuleRepository implements AlertRuleRepository {
  public constructor(private readonly database: Database) {}

  public async save(rule: AlertRule): Promise<void> {
    const condition = columns(rule.props.condition);
    this.database
      .prepare(
        `INSERT INTO alert_rules (
          id, company_id, code, name, enabled, severity, condition_type, metric_type,
          operator, threshold, expected_status, duration_seconds, recovery_duration_seconds,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          enabled = excluded.enabled,
          severity = excluded.severity,
          condition_type = excluded.condition_type,
          metric_type = excluded.metric_type,
          operator = excluded.operator,
          threshold = excluded.threshold,
          expected_status = excluded.expected_status,
          duration_seconds = excluded.duration_seconds,
          recovery_duration_seconds = excluded.recovery_duration_seconds,
          updated_at = excluded.updated_at
        WHERE alert_rules.company_id = excluded.company_id`,
      )
      .run(
        rule.props.id,
        rule.props.companyId,
        rule.props.code,
        rule.props.name,
        rule.props.enabled ? 1 : 0,
        rule.props.severity,
        condition.conditionType,
        condition.metricType,
        condition.operator,
        condition.threshold,
        condition.expectedStatus,
        rule.props.durationSeconds,
        rule.props.recoveryDurationSeconds,
        rule.props.createdAt.toISOString(),
        rule.props.updatedAt.toISOString(),
      );
  }

  public findActiveByCompany(companyId: string): Promise<AlertRule[]> {
    const rows = this.database
      .prepare('SELECT * FROM alert_rules WHERE company_id = ? AND enabled = 1 ORDER BY code')
      .all(companyId) as AlertRuleRow[];
    return Promise.resolve(rows.map(mapRule));
  }

  public findByCode(companyId: string, code: string): Promise<AlertRule | null> {
    return Promise.resolve(
      this.findOne('SELECT * FROM alert_rules WHERE company_id = ? AND code = ?', [
        companyId,
        code,
      ]),
    );
  }

  public findRuleById(companyId: string, id: string): Promise<AlertRule | null> {
    return Promise.resolve(
      this.findOne('SELECT * FROM alert_rules WHERE company_id = ? AND id = ?', [companyId, id]),
    );
  }

  public listByCompany(companyId: string): Promise<AlertRule[]> {
    const rows = this.database
      .prepare('SELECT * FROM alert_rules WHERE company_id = ? ORDER BY code')
      .all(companyId) as AlertRuleRow[];
    return Promise.resolve(rows.map(mapRule));
  }

  private findOne(sql: string, parameters: readonly string[]): AlertRule | null {
    const row = this.database.prepare(sql).get(...parameters) as AlertRuleRow | undefined;
    return row === undefined ? null : mapRule(row);
  }
}

function mapRule(row: AlertRuleRow): AlertRule {
  return AlertRule.create({
    code: row.code,
    companyId: row.company_id,
    condition:
      row.condition_type === 'equipment_status'
        ? { expectedStatus: 'DOWN', operator: 'equals', type: 'equipment_status' }
        : {
            metricType: row.metric_type as string,
            operator: 'greater_than',
            threshold: row.threshold as number,
            type: 'metric_threshold',
          },
    createdAt: new Date(row.created_at),
    durationSeconds: row.duration_seconds,
    enabled: row.enabled === 1,
    id: row.id,
    name: row.name,
    recoveryDurationSeconds: row.recovery_duration_seconds,
    severity: row.severity,
    updatedAt: new Date(row.updated_at),
  });
}

function columns(condition: AlertRuleCondition): {
  conditionType: AlertRuleCondition['type'];
  expectedStatus: 'DOWN' | null;
  metricType: string | null;
  operator: AlertRuleCondition['operator'];
  threshold: number | null;
} {
  return condition.type === 'equipment_status'
    ? {
        conditionType: condition.type,
        expectedStatus: condition.expectedStatus,
        metricType: null,
        operator: condition.operator,
        threshold: null,
      }
    : {
        conditionType: condition.type,
        expectedStatus: null,
        metricType: condition.metricType,
        operator: condition.operator,
        threshold: condition.threshold,
      };
}
