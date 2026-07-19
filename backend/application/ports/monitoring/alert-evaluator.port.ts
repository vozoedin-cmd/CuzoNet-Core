import type { EquipmentState } from '../../../domain/monitoring/equipment-state.js';
import type { Observation } from '../../../domain/monitoring/observation.js';

export interface AlertEvaluationInput {
  readonly companyId: string;
  readonly equipmentStates: readonly EquipmentState[];
  readonly observations: readonly Observation[];
}

/** Puerto de integración batch. El evaluador puro vive en domain/alerting. */
export interface AlertingBatchEvaluator {
  evaluate(input: AlertEvaluationInput): Promise<void>;
}
