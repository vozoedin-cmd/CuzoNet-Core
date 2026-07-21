import type { AlertRule } from '../../../domain/alerting/alert-rule.js';

export const AlertRuleMapper = {
  toDto(rule: AlertRule): Record<string, unknown> {
    return {
      ...rule.props,
      createdAt: rule.props.createdAt.toISOString(),
      updatedAt: rule.props.updatedAt.toISOString(),
    };
  },
};
