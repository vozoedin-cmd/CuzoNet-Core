import type { AutomationRule } from '../../../domain/automation/automation-rule.js';
export interface AutomationRuleRepository {
  save(rule: AutomationRule): Promise<void>;
}
