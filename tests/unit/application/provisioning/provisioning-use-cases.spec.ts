import { beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import type { ActorContext } from '../../../../backend/application/ports/provisioning/actor-context.port.js';
import { GetProvisioningOperation } from '../../../../backend/application/use-cases/provisioning/get-provisioning-operation/get-provisioning-operation.use-case.js';
import { RequestProvisioningOperation } from '../../../../backend/application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import { Service } from '../../../../backend/domain/services/service.js';
import { BillingDay } from '../../../../backend/domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../../backend/domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../../backend/domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../../backend/domain/services/value-objects/service-id.js';
import { ServiceType } from '../../../../backend/domain/services/value-objects/service-type.js';
import { InMemoryProvisioningOperationRepository } from '../../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-operation-repository.js';
import { InMemoryProvisioningUnitOfWork } from '../../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-unit-of-work.js';
import { InMemoryServiceRepository } from '../../../../backend/infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { InMemoryOutbox } from '../../../../backend/infrastructure/events/in-memory-outbox.js';
import { UuidV7IdGenerator } from '../../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { ExponentialRetryPolicy } from '../../../../backend/infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from '../../../../backend/infrastructure/provisioning/services/service-reader-provisioning.adapter.js';

const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const routerId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const actorContext: ActorContext = { getActorId: () => 'actor-one' };
const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };

describe('Provisioning use cases', () => {
  let repository: InMemoryProvisioningOperationRepository;
  let outbox: InMemoryOutbox;
  let requestOperation: RequestProvisioningOperation;

  beforeEach(async () => {
    repository = new InMemoryProvisioningOperationRepository();
    outbox = new InMemoryOutbox();
    const services = new InMemoryServiceRepository();
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
    requestOperation = new RequestProvisioningOperation(
      repository,
      repository,
      new ServiceReaderProvisioningAdapter(services),
      outbox,
      new InMemoryProvisioningUnitOfWork(),
      companyContext,
      actorContext,
      new UuidV7IdGenerator(),
      clock,
      new ExponentialRetryPolicy(3),
    );
  });

  it('crea una operación idempotente, persiste outbox y permite consultarla', async () => {
    const input = {
      causationId: 'provision-service-0001',
      correlationId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50',
      idempotencyKey: 'provision-service-0001',
      routerId,
      serviceId,
      type: 'provision' as const,
    };
    const first = await requestOperation.execute(input);
    const repeated = await requestOperation.execute(input);
    expect(repeated).toEqual(first);
    expect(outbox.events().map((event) => event.eventType)).toEqual([
      'ProvisioningOperationQueued.v1',
    ]);
    const dto = await new GetProvisioningOperation(repository, companyContext).execute({
      operationId: first.operationId,
    });
    expect(dto).toMatchObject({
      attemptCount: 0,
      lastError: null,
      serviceId,
      status: 'queued',
      type: 'provision',
    });
  });

  it('rechaza un servicio inexistente', async () => {
    await expect(
      requestOperation.execute({
        causationId: 'provision-missing-001',
        correlationId: 'correlation',
        idempotencyKey: 'provision-missing-001',
        routerId,
        serviceId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c99',
        type: 'provision',
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
