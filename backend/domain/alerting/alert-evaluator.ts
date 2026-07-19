import type { EquipmentState } from '../monitoring/equipment-state.js';
import type { Observation } from '../monitoring/observation.js';
import type { AlertDecision } from './alert-decision.js';
import { AlertDecisions } from './alert-decision.js';
import type { AlertRule } from './alert-rule.js';

export interface EvaluateAlertInput {
  readonly equipmentState: EquipmentState;
  readonly observation: Observation;
  readonly rule: AlertRule;
}

/** Interpreta únicamente la condición actual, sin persistencia ni infraestructura. */
export class AlertEvaluator {
  public evaluate(input: EvaluateAlertInput): AlertDecision {
    const condition = input.rule.props.condition;
    if (condition.type === 'equipment_status') {
      if (
        input.observation.props.metricType !== 'packet_loss' ||
        input.observation.props.metricValue.unit !== 'percent'
      ) {
        return AlertDecisions.ignore;
      }
      return input.equipmentState.props.status === condition.expectedStatus
        ? AlertDecisions.trigger
        : AlertDecisions.recover;
    }

    if (input.observation.props.metricType !== condition.metricType) {
      return AlertDecisions.ignore;
    }
    return input.observation.props.metricValue.value > condition.threshold
      ? AlertDecisions.trigger
      : AlertDecisions.recover;
  }
}
