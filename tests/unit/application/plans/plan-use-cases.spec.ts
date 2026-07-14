import { beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import { CreatePlan } from '../../../../backend/application/use-cases/plans/create-plan/create-plan.use-case.js';
import { ListPlans } from '../../../../backend/application/use-cases/plans/list-plans/list-plans.use-case.js';
import { RevisePlan } from '../../../../backend/application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import { InMemoryPlanRepository } from '../../../../backend/infrastructure/database/plans/in-memory/in-memory-plan-repository.js';
import { UuidV7IdGenerator } from '../../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const clock: Clock = { now: () => new Date('2026-07-13T12:00:00.000Z') };

describe('Plans use cases', () => {
  let repository: InMemoryPlanRepository;
  let createPlan: CreatePlan;

  beforeEach(() => {
    repository = new InMemoryPlanRepository();
    createPlan = new CreatePlan(repository, companyContext, new UuidV7IdGenerator(), clock);
  });

  async function create(code = 'HOME_20') {
    return createPlan.execute({
      causationId: 'create-plan-0001',
      code,
      correlationId: 'correlation-one',
      downloadKbps: 20_000,
      name: 'Hogar 20 Mbps',
      priceCents: 25_000,
      serviceType: 'simple_queue',
      uploadKbps: 10_000,
    });
  }

  it('crea, lista y revisa un plan con identidades UUIDv7 independientes', async () => {
    const created = await create();
    const revised = await new RevisePlan(
      repository,
      companyContext,
      new UuidV7IdGenerator(),
      clock,
    ).execute({
      causationId: 'revise-plan-0001',
      correlationId: 'correlation-two',
      downloadKbps: 30_000,
      effectiveFrom: '2026-08-01',
      planId: created.plan.id,
      priceCents: 30_000,
      uploadKbps: 15_000,
    });
    const listed = await new ListPlans(repository, companyContext).execute();
    const resolved = await repository.findByPlanVersionId(
      'company-one',
      revised.plan.currentVersion.id,
    );

    expect(created.plan.currentVersion.version).toBe(1);
    expect(revised.plan.currentVersion).toMatchObject({ version: 2, priceCents: 30_000 });
    expect(revised.plan.currentVersion.id).not.toBe(created.plan.currentVersion.id);
    expect(listed).toEqual([revised.plan]);
    expect(resolved).toEqual({
      downloadKbps: 30_000,
      planVersionId: revised.plan.currentVersion.id,
      serviceType: 'simple_queue',
      uploadKbps: 15_000,
    });
  });

  it('rechaza codigos duplicados y tipos aun no implementados', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({ code: 'PLAN_CODE_CONFLICT' });
    await expect(
      createPlan.execute({
        causationId: 'create-plan-0002',
        code: 'PPPOE_20',
        correlationId: 'correlation-two',
        downloadKbps: 20_000,
        name: 'PPPoE 20 Mbps',
        priceCents: 25_000,
        serviceType: 'pppoe',
        uploadKbps: 10_000,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PLAN_SERVICE_TYPE' });
  });
});
