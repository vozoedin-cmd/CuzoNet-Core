import { AutomationRule } from '../../../../domain/automation/automation-rule.js';
import {
  ActionDefinition,
  type ActionDefinitionProps,
} from '../../../../domain/automation/value-objects/action-definition.js';
import { AutomationRuleId } from '../../../../domain/automation/value-objects/automation-rule-id.js';
import { AutomationRuleName } from '../../../../domain/automation/value-objects/automation-rule-name.js';
import {
  AutomationRuleStatus,
  type AutomationRuleStatusValue,
} from '../../../../domain/automation/value-objects/automation-rule-status.js';
import { AutomationRuleVersion } from '../../../../domain/automation/value-objects/automation-rule-version.js';
import { EventTrigger } from '../../../../domain/automation/value-objects/event-trigger.js';
import {
  RuleCondition,
  type NormalizedRuleCondition,
  type RuleConditionDefinition,
} from '../../../../domain/automation/value-objects/rule-condition.js';
export interface AutomationRuleRecord {
  actions: readonly ActionDefinitionProps[];
  companyId: string;
  condition: RuleConditionDefinition;
  createdAt: string;
  createdBy: string;
  eventType: string;
  id: string;
  name: string;
  priority: number;
  schemaVersion: number;
  status: AutomationRuleStatusValue;
  updatedAt: string | undefined;
  updatedBy: string | undefined;
  version: number;
}
function serialize(node: NormalizedRuleCondition): RuleConditionDefinition {
  if (node.kind === 'comparison')
    return {
      kind: 'comparison',
      operator: node.operator,
      path: node.path.value,
      ...(node.value === undefined ? {} : { value: node.value }),
    };
  if (node.kind === 'not') return { condition: serialize(node.condition), kind: 'not' };
  return { conditions: node.conditions.map(serialize), kind: node.kind };
}
export const inMemoryAutomationRuleMapper = {
  toRecord(rule: AutomationRule): AutomationRuleRecord {
    return {
      actions: rule.actions.map((action) => ({
        actionType: action.actionType,
        actionVersion: action.actionVersion,
        reasonCode: action.reasonCode,
        targetFactPath: action.targetFactPath.value,
      })),
      companyId: rule.companyId,
      condition: serialize(rule.condition.definition),
      createdAt: rule.createdAt.toISOString(),
      createdBy: rule.createdBy,
      eventType: rule.trigger.eventType,
      id: rule.id.value,
      name: rule.name.value,
      priority: rule.priority,
      schemaVersion: rule.trigger.schemaVersion,
      status: rule.status.value,
      updatedAt: rule.updatedAt?.toISOString(),
      updatedBy: rule.updatedBy,
      version: rule.version.value,
    };
  },
  toDomain(record: AutomationRuleRecord): AutomationRule {
    return AutomationRule.rehydrate({
      actions: record.actions.map(ActionDefinition.create),
      companyId: record.companyId,
      condition: RuleCondition.create(record.condition),
      createdAt: new Date(record.createdAt),
      createdBy: record.createdBy,
      id: AutomationRuleId.create(record.id),
      name: AutomationRuleName.create(record.name),
      priority: record.priority,
      status: AutomationRuleStatus.create(record.status),
      trigger: EventTrigger.create(record.eventType, record.schemaVersion),
      updatedAt: record.updatedAt === undefined ? undefined : new Date(record.updatedAt),
      updatedBy: record.updatedBy,
      version: AutomationRuleVersion.create(record.version),
    });
  },
};
