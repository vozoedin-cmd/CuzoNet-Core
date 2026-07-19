import type { Database } from 'better-sqlite3';

import type { AlertEvaluationStateRepository } from '../../application/ports/alerting/alert-evaluation-state.repository.js';
import { AlertEvaluationState } from '../../domain/alerting/alert-evaluation-state.js';

interface EvaluationStateRow {
  company_id: string;
  condition_started_at: string | null;
  equipment_id: string;
  last_condition_matched: number;
  last_observed_at: string | null;
  recovery_started_at: string | null;
  rule_id: string;
  updated_at: string;
}

export class SqliteAlertEvaluationStateRepository implements AlertEvaluationStateRepository {
  public constructor(private readonly database: Database) {}

  public find(
    companyId: string,
    ruleId: string,
    equipmentId: string,
  ): Promise<AlertEvaluationState | null> {
    const row = this.database
      .prepare(
        `SELECT * FROM alert_evaluation_states
         WHERE company_id = ? AND rule_id = ? AND equipment_id = ?`,
      )
      .get(companyId, ruleId, equipmentId) as EvaluationStateRow | undefined;
    return Promise.resolve(row === undefined ? null : mapState(row));
  }

  public async save(state: AlertEvaluationState): Promise<void> {
    const props = state.props;
    this.database
      .prepare(
        `INSERT INTO alert_evaluation_states (
          company_id, rule_id, equipment_id, condition_started_at, recovery_started_at,
          last_observed_at, last_condition_matched, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, rule_id, equipment_id) DO UPDATE SET
          condition_started_at = excluded.condition_started_at,
          recovery_started_at = excluded.recovery_started_at,
          last_observed_at = excluded.last_observed_at,
          last_condition_matched = excluded.last_condition_matched,
          updated_at = excluded.updated_at`,
      )
      .run(
        props.companyId,
        props.ruleId,
        props.equipmentId,
        props.conditionStartedAt?.toISOString() ?? null,
        props.recoveryStartedAt?.toISOString() ?? null,
        props.lastObservedAt?.toISOString() ?? null,
        props.lastConditionMatched ? 1 : 0,
        props.updatedAt.toISOString(),
      );
  }
}

function mapState(row: EvaluationStateRow): AlertEvaluationState {
  return AlertEvaluationState.reconstitute({
    companyId: row.company_id,
    equipmentId: row.equipment_id,
    lastConditionMatched: row.last_condition_matched === 1,
    ruleId: row.rule_id,
    updatedAt: new Date(row.updated_at),
    ...(row.condition_started_at === null
      ? {}
      : { conditionStartedAt: new Date(row.condition_started_at) }),
    ...(row.last_observed_at === null ? {} : { lastObservedAt: new Date(row.last_observed_at) }),
    ...(row.recovery_started_at === null
      ? {}
      : { recoveryStartedAt: new Date(row.recovery_started_at) }),
  });
}
