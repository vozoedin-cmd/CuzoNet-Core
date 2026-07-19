import { AutomationRule } from '../../../../domain/automation/automation-rule.js';
import { ActionDefinition, type ActionDefinitionProps } from '../../../../domain/automation/value-objects/action-definition.js';
import { AutomationRuleId } from '../../../../domain/automation/value-objects/automation-rule-id.js';
import { AutomationRuleName } from '../../../../domain/automation/value-objects/automation-rule-name.js';
import { AutomationRuleStatus } from '../../../../domain/automation/value-objects/automation-rule-status.js';
import { AutomationRuleVersion } from '../../../../domain/automation/value-objects/automation-rule-version.js';
import { EventTrigger } from '../../../../domain/automation/value-objects/event-trigger.js';
import {
  RuleCondition,
  type NormalizedRuleCondition,
  type RuleConditionDefinition,
} from '../../../../domain/automation/value-objects/rule-condition.js';
import type { AutomationRuleTable } from '../../sqlite/database-schema.js';

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

export const sqliteAutomationRuleMapper = {
  serializeActions(rule: AutomationRule): string {
    return JSON.stringify(
      rule.actions.map((action) => {
        const result: Record<string, unknown> = {
          actionType: action.actionType,
          actionVersion: action.actionVersion,
        };
        if (action.reasonCode !== undefined) result.reasonCode = action.reasonCode;
        if (action.targetFactPath !== undefined) result.targetFactPath = action.targetFactPath.value;
        if (action.configurationReference !== undefined) result.configurationReference = action.configurationReference;
        if (action.payloadTemplate !== undefined) result.payloadTemplate = action.payloadTemplate;
        if (action.workflowKey !== undefined) result.workflowKey = action.workflowKey;
        if (action.operationType !== undefined) result.operationType = action.operationType;
        if (action.equipmentId !== undefined) result.equipmentId = action.equipmentId;
        if (action.parameters !== undefined) result.parameters = action.parameters;
        return result;
      }),
    );
  },
  serializeCondition(rule: AutomationRule): string {
    return JSON.stringify(serializeCondition(rule.condition.definition));
  },
  toDomain(record: AutomationRuleTable): AutomationRule {
    return AutomationRule.rehydrate({
      actions: (JSON.parse(record.actions_definition) as ActionDefinitionProps[]).map(
        ActionDefinition.create,
      ),
      companyId: record.company_id,
      condition: RuleCondition.create(
        JSON.parse(record.condition_definition) as RuleConditionDefinition,
      ),
      createdAt: new Date(record.created_at),
      createdBy: record.created_by,
      id: AutomationRuleId.create(record.id),
      name: AutomationRuleName.create(record.name),
      priority: record.priority,
      status: AutomationRuleStatus.create(record.status),
      trigger: EventTrigger.create(record.trigger_event_type, record.schema_version),
      updatedAt: record.updated_at === null ? undefined : new Date(record.updated_at),
      updatedBy: record.updated_by ?? undefined,
      version: AutomationRuleVersion.create(record.version),
    });
  },
};
