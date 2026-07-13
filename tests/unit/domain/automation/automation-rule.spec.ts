import { describe, expect, it } from 'vitest';

import { AutomationRule } from '../../../../backend/domain/automation/automation-rule.js';
import { RuleEvaluator } from '../../../../backend/domain/automation/services/rule-evaluator.js';
import { ActionDefinition } from '../../../../backend/domain/automation/value-objects/action-definition.js';
import { AutomationRuleId } from '../../../../backend/domain/automation/value-objects/automation-rule-id.js';
import { AutomationRuleName } from '../../../../backend/domain/automation/value-objects/automation-rule-name.js';
import { AutomationRuleStatus } from '../../../../backend/domain/automation/value-objects/automation-rule-status.js';
import { AutomationRuleVersion } from '../../../../backend/domain/automation/value-objects/automation-rule-version.js';
import { EvaluationContext } from '../../../../backend/domain/automation/value-objects/evaluation-context.js';
import { EventTrigger } from '../../../../backend/domain/automation/value-objects/event-trigger.js';
import { FactPath } from '../../../../backend/domain/automation/value-objects/fact-path.js';
import { RuleCondition } from '../../../../backend/domain/automation/value-objects/rule-condition.js';

const ruleId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d01';

function createRule(priority = 100): AutomationRule {
  return AutomationRule.create({
    actions: [
      ActionDefinition.create({
        actionType: 'request_service_reactivation',
        actionVersion: 1,
        reasonCode: 'PAYMENT_CLEARED',
        targetFactPath: 'service.id',
      }),
    ],
    companyId: 'company-one',
    condition: RuleCondition.create({
      kind: 'comparison',
      operator: 'equals',
      path: 'billing.debtCents',
      value: 0,
    }),
    createdAt: new Date('2026-07-12T10:00:00.000Z'),
    createdBy: 'actor-one',
    id: AutomationRuleId.create(ruleId),
    name: AutomationRuleName.create('Reactivar al liquidar deuda'),
    priority,
    status: AutomationRuleStatus.active(),
    trigger: EventTrigger.create('PaymentRecorded.v1', 1),
    version: AutomationRuleVersion.create(1),
  });
}

describe('AutomationRule', () => {
  it('conserva la prioridad y la versión explícita de cada acción', () => {
    const rule = createRule(750);

    expect(rule.priority).toBe(750);
    expect(rule.actions[0]).toMatchObject({
      actionType: 'request_service_reactivation',
      actionVersion: 1,
    });
  });

  it('rechaza prioridades fuera del rango permitido', () => {
    expect(() => createRule(1001)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AUTOMATION_RULE' }),
    );
  });

  it('rechaza una versión de acción que no está soportada', () => {
    expect(() =>
      ActionDefinition.create({
        actionType: 'request_service_reactivation',
        actionVersion: 2,
        reasonCode: 'PAYMENT_CLEARED',
        targetFactPath: 'service.id',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AUTOMATION_RULE' }));
  });

  it('mantiene FactPath como catálogo cerrado', () => {
    expect(FactPath.create('service.id').value).toBe('service.id');
    expect(() => FactPath.create('payload.arbitraryField')).toThrowError(
      expect.objectContaining({ code: 'INVALID_AUTOMATION_RULE' }),
    );
    expect(() =>
      EvaluationContext.create('context-one', { 'payload.arbitraryField': 'unsafe' }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AUTOMATION_RULE' }));
  });

  it('evalúa condiciones compuestas únicamente sobre hechos autorizados', () => {
    const condition = RuleCondition.create({
      conditions: [
        {
          kind: 'comparison',
          operator: 'equals',
          path: 'billing.debtCents',
          value: 0,
        },
        {
          kind: 'comparison',
          operator: 'equals',
          path: 'service.lifecycleStatus',
          value: 'suspended',
        },
      ],
      kind: 'all',
    });
    const context = EvaluationContext.create('service-one', {
      'billing.debtCents': 0,
      'service.lifecycleStatus': 'suspended',
    });

    expect(new RuleEvaluator().evaluate(condition, context).matched).toBe(true);
  });
});
