import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export class AutomationRuleVersion {
  private constructor(public readonly value: number) {}
  public static create(value: number): AutomationRuleVersion {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new InvalidAutomationRuleError('version', 'Debe ser un entero mayor que cero.');
    return new AutomationRuleVersion(value);
  }
  public next(): AutomationRuleVersion {
    return AutomationRuleVersion.create(this.value + 1);
  }
}
