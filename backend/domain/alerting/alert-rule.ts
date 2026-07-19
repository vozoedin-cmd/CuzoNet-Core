import { alertSeverities, type AlertCondition, type AlertSeverity } from './incident-types.js';

export type AlertRuleCondition = AlertCondition;

export interface AlertRuleProps {
  readonly code: string;
  readonly companyId: string;
  readonly condition: AlertRuleCondition;
  readonly createdAt: Date;
  readonly durationSeconds: number;
  readonly enabled: boolean;
  readonly id: string;
  readonly name: string;
  readonly recoveryDurationSeconds: number;
  readonly severity: AlertSeverity;
  readonly updatedAt: Date;
}

export class AlertRule {
  private constructor(public readonly props: AlertRuleProps) {}

  public static create(props: AlertRuleProps): AlertRule {
    const id = required(props.id, 'id');
    const companyId = required(props.companyId, 'companyId');
    const code = required(props.code, 'code');
    const name = required(props.name, 'name');
    if (!alertSeverities.includes(props.severity))
      throw new Error('AlertRule severity is invalid.');
    positiveInteger(props.durationSeconds, 'durationSeconds');
    positiveInteger(props.recoveryDurationSeconds, 'recoveryDurationSeconds');
    const createdAt = validDate(props.createdAt, 'createdAt');
    const updatedAt = validDate(props.updatedAt, 'updatedAt');
    if (props.condition.type === 'metric_threshold') {
      required(props.condition.metricType, 'metricType');
      if (!Number.isFinite(props.condition.threshold)) {
        throw new RangeError('AlertRule threshold must be finite.');
      }
    } else if (props.condition.expectedStatus !== 'DOWN') {
      throw new Error('AlertRule expectedStatus is invalid.');
    }
    return new AlertRule({
      ...props,
      code,
      companyId,
      createdAt,
      id,
      name,
      updatedAt,
    });
  }
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`AlertRule ${name} must be a positive integer.`);
  }
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`AlertRule ${name} is required.`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (Number.isNaN(value.getTime())) throw new RangeError(`AlertRule ${name} must be valid.`);
  return new Date(value);
}
