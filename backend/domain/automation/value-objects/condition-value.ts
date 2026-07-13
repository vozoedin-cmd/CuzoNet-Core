import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export type ConditionScalar = string | number | boolean | null;
export type ConditionValue = ConditionScalar | readonly ConditionScalar[];
export function validateConditionValue(value: unknown): ConditionValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every(
      (item) =>
        item === null ||
        typeof item === 'string' ||
        typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item)),
    )
  )
    return Object.freeze([...value]) as readonly ConditionScalar[];
  throw new InvalidAutomationRuleError('condition.value', 'Valor de condición no permitido.');
}
