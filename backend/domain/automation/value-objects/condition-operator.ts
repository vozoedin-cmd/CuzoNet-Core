import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export const conditionOperators = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'in',
  'exists',
] as const;
export type ConditionOperatorValue = (typeof conditionOperators)[number];
export function createConditionOperator(value: string): ConditionOperatorValue {
  if (!conditionOperators.some((operator) => operator === value))
    throw new InvalidAutomationRuleError('condition.operator', 'Operador no permitido.');
  return value as ConditionOperatorValue;
}
