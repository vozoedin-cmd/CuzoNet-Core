import { beforeEach, describe, expect, it } from 'vitest';

import type { AutomationFactsPort } from '../../../../backend/application/ports/automation/automation-facts.port.js';
import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../../backend/application/ports/id-generator.port.js';
import { CreateAutomationRule } from '../../../../backend/application/use-cases/automation/create-automation-rule/create-automation-rule.use-case.js';
import { EvaluateDomainEvent } from '../../../../backend/application/use-cases/automation/evaluate-domain-event/evaluate-domain-event.use-case.js';
import { EvaluateRuleDryRun } from '../../../../backend/application/use-cases/automation/evaluate-rule-dry-run/evaluate-rule-dry-run.use-case.js';
import { EvaluationContext } from '../../../../backend/domain/automation/value-objects/evaluation-context.js';
import { InMemoryAutomationEventReceipt } from '../../../../backend/infrastructure/database/automation/in-memory/in-memory-automation-event-receipt.js';
import { InMemoryAutomationExecutionRepository } from '../../../../backend/infrastructure/database/automation/in-memory/in-memory-automation-execution-repository.js';
import { InMemoryAutomationRuleRepository } from '../../../../backend/infrastructure/database/automation/in-memory/in-memory-automation-rule-repository.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const actorContext = { getActorId: () => 'actor-one' };
const clock: Clock = { now: () => new Date('2026-07-12T10:00:00.000Z') };
const ruleId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d10';
const executionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d11';

class SequentialIdGenerator implements IdGenerator {
  private index = 0;

  public constructor(private readonly ids: readonly string[]) {}

  public generate(): string {
    const id = this.ids[this.index];
    if (id === undefined) {
      throw new Error('No quedan identificadores de prueba.');
    }
    this.index += 1;
    return id;
  }
}

function ruleInput(priority = 500) {
  return {
    actions: [
      {
        actionType: 'request_service_reactivation' as const,
        actionVersion: 1,
        reasonCode: 'PAYMENT_CLEARED',
        targetFactPath: 'service.id',
      },
    ],
    active: true,
    condition: {
      conditions: [
        {
          kind: 'comparison' as const,
          operator: 'equals' as const,
          path: 'billing.debtCents',
          value: 0,
        },
        {
          kind: 'comparison' as const,
          operator: 'equals' as const,
          path: 'service.lifecycleStatus',
          value: 'suspended',
        },
      ],
      kind: 'all' as const,
    },
    name: 'Reactivar al liquidar deuda',
    priority,
    trigger: { eventType: 'PaymentRecorded.v1', schemaVersion: 1 },
  };
}

describe('Automation use cases', () => {
  let rules: InMemoryAutomationRuleRepository;

  beforeEach(() => {
    rules = new InMemoryAutomationRuleRepository();
  });

  it('crea reglas con priority y actionVersion', async () => {
    const create = new CreateAutomationRule(
      rules,
      companyContext,
      actorContext,
      new SequentialIdGenerator([ruleId]),
      clock,
    );

    const result = await create.execute(ruleInput(900));

    expect(result).toMatchObject({ priority: 900, version: 1 });
    expect(result.actions[0]).toMatchObject({ actionVersion: 1 });
  });

  it('hace dry run sin persistir una ejecución ni solicitar acciones', async () => {
    await new CreateAutomationRule(
      rules,
      companyContext,
      actorContext,
      new SequentialIdGenerator([ruleId]),
      clock,
    ).execute(ruleInput());

    const result = await new EvaluateRuleDryRun(rules, companyContext).execute({
      contextId: 'service-one',
      facts: {
        'billing.debtCents': 0,
        'service.id': 'service-one',
        'service.lifecycleStatus': 'suspended',
      },
      ruleId,
    });

    expect(result).toEqual({
      actions: [
        {
          actionType: 'request_service_reactivation',
          actionVersion: 1,
          reasonCode: 'PAYMENT_CLEARED',
          targetServiceId: 'service-one',
        },
      ],
      matched: true,
      ruleId,
      ruleVersion: 1,
    });
  });

  it('evalúa PaymentRecorded una sola vez y solicita la acción mediante el puerto', async () => {
    await new CreateAutomationRule(
      rules,
      companyContext,
      actorContext,
      new SequentialIdGenerator([ruleId]),
      clock,
    ).execute(ruleInput());
    const executions = new InMemoryAutomationExecutionRepository();
    const receipts = new InMemoryAutomationEventReceipt();
    const facts: AutomationFactsPort = {
      buildContexts: () =>
        Promise.resolve([
          EvaluationContext.create('service-one', {
            'billing.debtCents': 0,
            'service.id': 'service-one',
            'service.lifecycleStatus': 'suspended',
          }),
        ]),
    };
    const evaluate = new EvaluateDomainEvent(
      rules,
      executions,
      receipts,
      facts,
      companyContext,
      new SequentialIdGenerator([executionId]),
      clock,
    );
    const event = {
      aggregateId: 'payment-one',
      aggregateType: 'Payment',
      causationId: 'record-payment-one',
      companyId: 'company-one',
      correlationId: 'correlation-one',
      eventId: 'event-one',
      eventType: 'PaymentRecorded.v1',
      occurredAt: '2026-07-12T10:00:00.000Z',
      payload: {
        billingAccountId: 'account-one',
        clientId: 'client-one',
        companyId: 'company-one',
        paymentId: 'payment-one',
      },
      schemaVersion: 1,
    };

    const first = await evaluate.execute(event);
    const repeated = await evaluate.execute(event);

    expect(first).toEqual({
      actionsRejected: 0,
      actionsRequested: 1,
      alreadyProcessed: false,
      eventId: 'event-one',
      rulesEvaluated: 1,
      rulesMatched: 1,
    });
    expect(repeated.alreadyProcessed).toBe(true);
    await expect(executions.findById('company-one', executionId)).resolves.toMatchObject({
      actionType: 'request_service_reactivation',
      status: 'pending',
    });
  });
});
