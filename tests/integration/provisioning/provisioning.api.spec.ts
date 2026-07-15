import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { ProvisioningController } from '../../../backend/api/provisioning/controller/provisioning.controller.js';
import { createProvisioningRouter } from '../../../backend/api/provisioning/routes/provisioning.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { GetProvisioningOperation } from '../../../backend/application/use-cases/provisioning/get-provisioning-operation/get-provisioning-operation.use-case.js';
import { RequestProvisioningOperation } from '../../../backend/application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import { Service } from '../../../backend/domain/services/service.js';
import { BillingDay } from '../../../backend/domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../backend/domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../backend/domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../backend/domain/services/value-objects/service-id.js';
import { ServiceType } from '../../../backend/domain/services/value-objects/service-type.js';
import { InMemoryProvisioningOperationRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-operation-repository.js';
import { InMemoryProvisioningUnitOfWork } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-unit-of-work.js';
import { InMemoryServiceRepository } from '../../../backend/infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { InMemoryOutbox } from '../../../backend/infrastructure/events/in-memory-outbox.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { ExponentialRetryPolicy } from '../../../backend/infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from '../../../backend/infrastructure/provisioning/services/service-reader-provisioning.adapter.js';

const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const routerId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';
const correlationId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50';
const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };

describe('Provisioning API integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const services = new InMemoryServiceRepository();
    const operations = new InMemoryProvisioningOperationRepository();
    await services.save(
      Service.create({
        billingDay: BillingDay.create(15),
        causationId: 'service-create-0001',
        clientId: ClientReferenceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c21'),
        companyId: 'company-one',
        correlationId: 'service-correlation',
        createdAt: clock.now(),
        eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c23',
        id: ServiceId.create(serviceId),
        planVersionId: PlanVersionId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22'),
        serviceType: ServiceType.create('simple_queue'),
      }),
    );
    const controller = new ProvisioningController({
      getOperation: new GetProvisioningOperation(operations, companyContext),
      requestOperation: new RequestProvisioningOperation(
        operations,
        operations,
        new ServiceReaderProvisioningAdapter(services),
        new InMemoryOutbox(),
        new InMemoryProvisioningUnitOfWork(),
        companyContext,
        { getActorId: () => 'actor-one' },
        new UuidV7IdGenerator(),
        clock,
        new ExponentialRetryPolicy(3),
      ),
    });
    app = createApp({ provisioningRouter: createProvisioningRouter(controller) });
  });

  it('crea con 202 y consulta la operación mediante los contratos OpenAPI', async () => {
    const accepted = await request(app)
      .post(`/api/v1/servicios/${serviceId}/operaciones`)
      .set('Idempotency-Key', 'provision-service-0001')
      .set('X-Correlation-Id', correlationId)
      .send({ type: 'provision', routerId })
      .expect(202);
    expect(accepted.body).toEqual({
      correlationId,
      operationId: accepted.body.operationId,
      status: 'queued',
    });
    expect(accepted.body.operationId.slice(14, 15)).toBe('7');
    const fetched = await request(app)
      .get(`/api/v1/operaciones/${accepted.body.operationId}`)
      .set('X-Correlation-Id', correlationId)
      .expect(200);
    expect(fetched.body).toEqual({
      attemptCount: 0,
      completedAt: null,
      createdAt: '2026-07-11T15:00:00.000Z',
      id: accepted.body.operationId,
      lastError: null,
      serviceId,
      status: 'queued',
      type: 'provision',
    });
  });

  it('propaga idempotencia sin crear otro operationId', async () => {
    const call = () =>
      request(app)
        .post(`/api/v1/servicios/${serviceId}/operaciones`)
        .set('Idempotency-Key', 'provision-service-0001')
        .set('X-Correlation-Id', correlationId)
        .send({ type: 'provision', routerId });
    const first = await call().expect(202);
    const second = await call().expect(202);
    expect(second.body).toEqual(first.body);
  });

  it('traduce validación, ausencia y rutas no oficiales con el manejador global', async () => {
    await request(app)
      .post(`/api/v1/servicios/${serviceId}/operaciones`)
      .set('Idempotency-Key', 'provision-service-0001')
      .send({ type: 'provision', routerId: 'invalid' })
      .expect(422);
    await request(app)
      .get('/api/v1/operaciones/01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c99')
      .expect(404);
    await request(app).post('/api/v1/provisioning/run').send({}).expect(404);
  });
});
