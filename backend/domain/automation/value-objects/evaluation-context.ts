import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
import type { ConditionScalar } from './condition-value.js';
import { FactPath, type FactPathValue } from './fact-path.js';
export type EvaluationFacts = Readonly<Partial<Record<FactPathValue, ConditionScalar>>>;
export class EvaluationContext {
  private constructor(
    public readonly id: string,
    private readonly facts: EvaluationFacts,
  ) {}
  public static create(id: string, facts: Readonly<Record<string, unknown>>): EvaluationContext {
    if (id.trim().length === 0 || id.length > 160)
      throw new InvalidAutomationRuleError('context.id', 'Context id no permitido.');
    const normalized: Partial<Record<FactPathValue, ConditionScalar>> = {};
    for (const [path, value] of Object.entries(facts)) {
      const factPath = FactPath.create(path).value;
      if (!(
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ))
        throw new InvalidAutomationRuleError(`context.${path}`, 'Fact value no permitido.');
      normalized[factPath] = value as ConditionScalar;
    }
    return new EvaluationContext(id, Object.freeze(normalized));
  }
  public get(path: FactPath): ConditionScalar | undefined {
    return this.facts[path.value];
  }
  public toRecord(): EvaluationFacts {
    return { ...this.facts };
  }
}
