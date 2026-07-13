import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
import { createConditionOperator, type ConditionOperatorValue } from './condition-operator.js';
import { validateConditionValue, type ConditionValue } from './condition-value.js';
import { FactPath } from './fact-path.js';

export type RuleConditionDefinition =
  | { kind: 'comparison'; operator: ConditionOperatorValue; path: string; value?: ConditionValue }
  | { conditions: readonly RuleConditionDefinition[]; kind: 'all' }
  | { conditions: readonly RuleConditionDefinition[]; kind: 'any' }
  | { condition: RuleConditionDefinition; kind: 'not' };

export type NormalizedRuleCondition =
  | {
      kind: 'comparison';
      operator: ConditionOperatorValue;
      path: FactPath;
      value: ConditionValue | undefined;
    }
  | { conditions: readonly NormalizedRuleCondition[]; kind: 'all' }
  | { conditions: readonly NormalizedRuleCondition[]; kind: 'any' }
  | { condition: NormalizedRuleCondition; kind: 'not' };

export class RuleCondition {
  private constructor(public readonly definition: NormalizedRuleCondition) {}

  public static create(definition: RuleConditionDefinition): RuleCondition {
    let clauses = 0;

    const normalize = (node: RuleConditionDefinition, depth: number): NormalizedRuleCondition => {
      if (depth > 5) {
        throw new InvalidAutomationRuleError('condition', 'La profundidad máxima es 5.');
      }

      if (node.kind === 'comparison') {
        clauses += 1;
        if (clauses > 25) {
          throw new InvalidAutomationRuleError('condition', 'La regla supera 25 comparaciones.');
        }

        const operator = createConditionOperator(node.operator);
        if (operator !== 'exists' && node.value === undefined) {
          throw new InvalidAutomationRuleError('condition.value', 'El operador requiere un valor.');
        }

        const value = node.value === undefined ? undefined : validateConditionValue(node.value);
        if (operator === 'in' && !Array.isArray(value)) {
          throw new InvalidAutomationRuleError(
            'condition.value',
            'El operador in requiere una lista.',
          );
        }

        return { kind: 'comparison', operator, path: FactPath.create(node.path), value };
      }

      if (node.kind === 'not') {
        return { condition: normalize(node.condition, depth + 1), kind: 'not' };
      }

      if (node.conditions.length < 1 || node.conditions.length > 25) {
        throw new InvalidAutomationRuleError(
          'condition.conditions',
          'El grupo debe contener entre 1 y 25 condiciones.',
        );
      }

      return {
        conditions: Object.freeze(node.conditions.map((child) => normalize(child, depth + 1))),
        kind: node.kind,
      };
    };

    return new RuleCondition(normalize(definition, 1));
  }
}
