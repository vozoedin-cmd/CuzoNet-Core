import type { EvaluationContext } from '../value-objects/evaluation-context.js';
import type { NormalizedRuleCondition, RuleCondition } from '../value-objects/rule-condition.js';
import { RuleEvaluationResult } from '../value-objects/rule-evaluation-result.js';

export class RuleEvaluator {
  public evaluate(condition: RuleCondition, context: EvaluationContext): RuleEvaluationResult {
    return this.evaluateNode(condition.definition, context)
      ? RuleEvaluationResult.matched()
      : RuleEvaluationResult.notMatched();
  }

  private evaluateNode(node: NormalizedRuleCondition, context: EvaluationContext): boolean {
    switch (node.kind) {
      case 'all':
        return node.conditions.every((condition) => this.evaluateNode(condition, context));
      case 'any':
        return node.conditions.some((condition) => this.evaluateNode(condition, context));
      case 'not':
        return !this.evaluateNode(node.condition, context);
      case 'comparison': {
        const actual = context.get(node.path);

        switch (node.operator) {
          case 'exists':
            return actual !== undefined && actual !== null;
          case 'equals':
            return actual === node.value;
          case 'not_equals':
            return actual !== node.value;
          case 'greater_than':
            return (
              typeof actual === 'number' && typeof node.value === 'number' && actual > node.value
            );
          case 'greater_than_or_equal':
            return (
              typeof actual === 'number' && typeof node.value === 'number' && actual >= node.value
            );
          case 'less_than':
            return (
              typeof actual === 'number' && typeof node.value === 'number' && actual < node.value
            );
          case 'less_than_or_equal':
            return (
              typeof actual === 'number' && typeof node.value === 'number' && actual <= node.value
            );
          case 'in':
            return Array.isArray(node.value) && node.value.includes(actual ?? null);
        }
      }
    }
  }
}
