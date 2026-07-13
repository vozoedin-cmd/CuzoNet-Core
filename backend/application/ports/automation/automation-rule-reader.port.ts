import type { AutomationRule } from '../../../domain/automation/automation-rule.js';
import type { AutomationRuleStatusValue } from '../../../domain/automation/value-objects/automation-rule-status.js';
import type { AutomationEventType } from '../../../domain/automation/value-objects/event-trigger.js';
export interface AutomationRuleListCriteria {
  companyId: string;
  eventType?: AutomationEventType;
  name?: string;
  status?: AutomationRuleStatusValue;
}
export interface AutomationRuleReader {
  findById(companyId: string, ruleId: string): Promise<AutomationRule | null>;
  list(criteria: AutomationRuleListCriteria): Promise<readonly AutomationRule[]>;
  listActiveByTrigger(
    companyId: string,
    eventType: AutomationEventType,
    schemaVersion: number,
  ): Promise<readonly AutomationRule[]>;
}
