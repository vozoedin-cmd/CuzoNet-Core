import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export class AutomationRuleName {
  private constructor(public readonly value: string) {}
  public static create(value: string): AutomationRuleName {
    const normalized = value.trim();
    if (normalized.length < 3 || normalized.length > 120)
      throw new InvalidAutomationRuleError('name', 'Debe contener entre 3 y 120 caracteres.');
    return new AutomationRuleName(normalized);
  }
}
