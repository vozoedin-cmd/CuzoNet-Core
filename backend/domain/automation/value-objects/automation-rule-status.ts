import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export type AutomationRuleStatusValue = 'active' | 'inactive';
export class AutomationRuleStatus {
  private constructor(public readonly value: AutomationRuleStatusValue) {}
  public static create(value: string): AutomationRuleStatus {
    if (value !== 'active' && value !== 'inactive')
      throw new InvalidAutomationRuleError('status', 'Estado no permitido.');
    return new AutomationRuleStatus(value);
  }
  public static active(): AutomationRuleStatus {
    return new AutomationRuleStatus('active');
  }
  public static inactive(): AutomationRuleStatus {
    return new AutomationRuleStatus('inactive');
  }
}
