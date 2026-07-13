import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { CreateAutomationRule } from '../../../backend/application/use-cases/automation/create-automation-rule/create-automation-rule.use-case.js';
import { InMemoryAutomationRuleRepository } from '../../../backend/infrastructure/database/automation/in-memory/in-memory-automation-rule-repository.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const actorContext = { getActorId: () => 'actor-one' };
const clock: Clock = { now: () => new Date('2026-07-12T10:00:00.000Z') };

function input(name: string, priority: number) {
  return {
    actions: [
      {
        actionType: 'request_service_reactivation',
        actionVersion: 1,
        reasonCode: 'PAYMENT_CLEARED',
        targetFactPath: 'service.id',
      },
    ],
    active: true,
    condition: {
      kind: 'comparison' as const,
      operator: 'equals' as const,
      path: 'billing.debtCents',
      value: 0,
    },
    name,
    priority,
    trigger: { eventType: 'PaymentRecorded.v1', schemaVersion: 1 },
  };
}

describe('InMemoryAutomationRuleRepository', () => {
  it('devuelve reglas activas por prioridad descendente y conserva actionVersion', async () => {
    const repository = new InMemoryAutomationRuleRepository();
    const ids = ['01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d20', '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d21'];
    let index = 0;
    const idGenerator = { generate: () => ids[index++] as string };
    const create = new CreateAutomationRule(
      repository,
      companyContext,
      actorContext,
      idGenerator,
      clock,
    );
    await create.execute(input('Prioridad baja', 10));
    await create.execute(input('Prioridad alta', 900));

    const rules = await repository.listActiveByTrigger('company-one', 'PaymentRecorded.v1', 1);

    expect(rules.map((rule) => rule.priority)).toEqual([900, 10]);
    expect(rules.map((rule) => rule.actions[0]?.actionVersion)).toEqual([1, 1]);
  });
});
