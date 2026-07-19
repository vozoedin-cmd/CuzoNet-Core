import type { AlertEvaluationState } from '../../../domain/alerting/alert-evaluation-state.js';

export interface AlertEvaluationStateRepository {
  find(
    companyId: string,
    ruleId: string,
    equipmentId: string,
  ): Promise<AlertEvaluationState | null>;
  save(state: AlertEvaluationState): Promise<void>;
}
