import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { PlansController } from '../../../backend/api/plans/controller/plans.controller.js';
import { createPlansRouter } from '../../../backend/api/plans/routes/plans.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { CreatePlan } from '../../../backend/application/use-cases/plans/create-plan/create-plan.use-case.js';
import { ListPlans } from '../../../backend/application/use-cases/plans/list-plans/list-plans.use-case.js';
import { RevisePlan } from '../../../backend/application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import { InMemoryPlanRepository } from '../../../backend/infrastructure/database/plans/in-memory/in-memory-plan-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const clock: Clock = { now: () => new Date('2026-07-13T12:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';

describe('Plans API integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const repository = new InMemoryPlanRepository();
    const idGenerator = new UuidV7IdGenerator();
    const controller = new PlansController({
      createPlan: new CreatePlan(repository, companyContext, idGenerator, clock),
      listPlans: new ListPlans(repository, companyContext),
      revisePlan: new RevisePlan(repository, companyContext, idGenerator, clock),
    });
    app = createApp({ plansRouter: createPlansRouter(controller) });
  });

  it('crea, lista y revisa un plan simple_queue', async () => {
    const created = await request(app)
      .post('/api/v1/planes')
      .set('Idempotency-Key', 'create-plan-0001')
      .set('X-Correlation-Id', correlationId)
      .send({
        code: 'HOME_20',
        downloadKbps: 20_000,
        name: 'Hogar 20 Mbps',
        priceCents: 25_000,
        serviceType: 'simple_queue',
        uploadKbps: 10_000,
      })
      .expect(201);

    expect(created.body.currentVersion.version).toBe(1);
    expect(created.body.currentVersion.id.slice(14, 15)).toBe('7');

    const revised = await request(app)
      .put(`/api/v1/planes/${created.body.id}`)
      .set('Idempotency-Key', 'revise-plan-0001')
      .set('X-Correlation-Id', correlationId)
      .send({
        downloadKbps: 30_000,
        effectiveFrom: '2026-08-01',
        priceCents: 30_000,
        uploadKbps: 15_000,
      })
      .expect(200);

    expect(revised.body.currentVersion).toMatchObject({
      downloadKbps: 30_000,
      uploadKbps: 15_000,
      version: 2,
    });
    await request(app)
      .get('/api/v1/planes')
      .expect(200)
      .expect((response) => expect(response.body).toEqual([revised.body]));
  });

  it('reconoce tipos futuros pero informa que aun no estan soportados', async () => {
    const response = await request(app)
      .post('/api/v1/planes')
      .set('Idempotency-Key', 'create-plan-0002')
      .set('X-Correlation-Id', correlationId)
      .send({
        code: 'PPPOE_20',
        downloadKbps: 20_000,
        name: 'PPPoE 20 Mbps',
        priceCents: 25_000,
        serviceType: 'pppoe',
        uploadKbps: 10_000,
      })
      .expect(422);

    expect(response.body).toMatchObject({
      code: 'UNSUPPORTED_PLAN_SERVICE_TYPE',
      correlationId,
    });
  });
});
