import { AlertRule } from './alert-rule.js';

export interface DefaultAlertRuleDefinition {
  readonly code: string;
  readonly condition: AlertRule['props']['condition'];
  readonly durationSeconds: number;
  readonly name: string;
  readonly recoveryDurationSeconds: number;
  readonly severity: AlertRule['props']['severity'];
}

export const defaultAlertRuleDefinitions: readonly DefaultAlertRuleDefinition[] = Object.freeze([
  {
    code: 'equipment-down',
    condition: { expectedStatus: 'DOWN', operator: 'equals', type: 'equipment_status' },
    durationSeconds: 30,
    name: 'Equipment DOWN',
    recoveryDurationSeconds: 30,
    severity: 'critical',
  },
  {
    code: 'high-cpu',
    condition: {
      metricType: 'cpu_usage',
      operator: 'greater_than',
      threshold: 90,
      type: 'metric_threshold',
    },
    durationSeconds: 300,
    name: 'High CPU usage',
    recoveryDurationSeconds: 120,
    severity: 'major',
  },
  {
    code: 'high-packet-loss',
    condition: {
      metricType: 'packet_loss',
      operator: 'greater_than',
      threshold: 20,
      type: 'metric_threshold',
    },
    durationSeconds: 120,
    name: 'High packet loss',
    recoveryDurationSeconds: 60,
    severity: 'warning',
  },
]);

export function createDefaultAlertRule(
  companyId: string,
  definition: DefaultAlertRuleDefinition,
  id: string,
  now: Date,
): AlertRule {
  return AlertRule.create({
    code: definition.code,
    companyId,
    condition: definition.condition,
    createdAt: now,
    durationSeconds: definition.durationSeconds,
    enabled: true,
    id,
    name: definition.name,
    recoveryDurationSeconds: definition.recoveryDurationSeconds,
    severity: definition.severity,
    updatedAt: now,
  });
}
