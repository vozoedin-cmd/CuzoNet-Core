import type { AutomationRule } from '../../../domain/automation/automation-rule.js';
import type { ActionDefinitionProps } from '../../../domain/automation/value-objects/action-definition.js';
import type { AutomationRuleStatusValue } from '../../../domain/automation/value-objects/automation-rule-status.js';
import type {
  RuleConditionDefinition,
  NormalizedRuleCondition,
} from '../../../domain/automation/value-objects/rule-condition.js';
export interface CreateAutomationRuleInput {
  actions: readonly ActionDefinitionProps[];
  active: boolean;
  condition: RuleConditionDefinition;
  name: string;
  priority: number;
  trigger: { eventType: string; schemaVersion: number };
}
export interface ReviseAutomationRuleInput {
  actions: readonly ActionDefinitionProps[];
  condition: RuleConditionDefinition;
  expectedVersion: number;
  name: string;
  priority: number;
  ruleId: string;
}
export interface AutomationRuleDto {
  actions: readonly ActionDefinitionProps[];
  condition: RuleConditionDefinition;
  createdAt: string;
  id: string;
  name: string;
  priority: number;
  status: AutomationRuleStatusValue;
  trigger: { eventType: string; schemaVersion: number };
  updatedAt?: string;
  version: number;
}
function serializeCondition(node: NormalizedRuleCondition): RuleConditionDefinition {
  if (node.kind === 'comparison')
    return {
      kind: 'comparison',
      operator: node.operator,
      path: node.path.value,
      ...(node.value === undefined ? {} : { value: node.value }),
    };
  if (node.kind === 'not') return { condition: serializeCondition(node.condition), kind: 'not' };
  return { conditions: node.conditions.map(serializeCondition), kind: node.kind };
}
export function toAutomationRuleDto(rule: AutomationRule): AutomationRuleDto {
  return {
    actions: rule.actions.map((action) => ({
      actionType: action.actionType,
      actionVersion: action.actionVersion,
      reasonCode: action.reasonCode,
      targetFactPath: action.targetFactPath.value,
    })),
    condition: serializeCondition(rule.condition.definition),
    createdAt: rule.createdAt.toISOString(),
    id: rule.id.value,
    name: rule.name.value,
    priority: rule.priority,
    status: rule.status.value,
    trigger: { eventType: rule.trigger.eventType, schemaVersion: rule.trigger.schemaVersion },
    ...(rule.updatedAt === undefined ? {} : { updatedAt: rule.updatedAt.toISOString() }),
    version: rule.version.value,
  };
}
