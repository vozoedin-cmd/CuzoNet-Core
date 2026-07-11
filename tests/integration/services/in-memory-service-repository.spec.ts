import { describe, expect, it } from 'vitest';

import { Service } from '../../../backend/domain/services/service.js';
import { BillingDay } from '../../../backend/domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../backend/domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../backend/domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../backend/domain/services/value-objects/service-id.js';
import { ServiceType } from '../../../backend/domain/services/value-objects/service-type.js';
import { InMemoryServiceRepository } from '../../../backend/infrastructure/database/services/in-memory/in-memory-service-repository.js';

const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c21';
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22';

function createService(): Service {
  return Service.create({
    billingDay: BillingDay.create(15),
    causationId: 'create-service-0001',
    clientId: ClientReferenceId.create(clientId),
    companyId: 'company-one',
    correlationId: 'correlation-one',
    createdAt: new Date('2026-07-11T15:00:00.000Z'),
    eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c23',
    id: ServiceId.create(serviceId),
    planVersionId: PlanVersionId.create(planVersionId),
    serviceType: ServiceType.create('simple_queue'),
  });
}

describe('InMemoryServiceRepository integration', () => {
  it('implementa escritura y lectura con rehidratación de createdAt', async () => {
    const repository = new InMemoryServiceRepository();
    await repository.save(createService());

    const stored = await repository.findById('company-one', serviceId);
    const list = await repository.listByClient('company-one', clientId);

    expect(stored?.createdAt.toISOString()).toBe('2026-07-11T15:00:00.000Z');
    expect(stored?.pullDomainEvents()).toEqual([]);
    expect(list).toHaveLength(1);
  });

  it('aísla las consultas por empresa', async () => {
    const repository = new InMemoryServiceRepository();
    await repository.save(createService());

    await expect(repository.findById('company-two', serviceId)).resolves.toBeNull();
    await expect(repository.listByClient('company-two', clientId)).resolves.toEqual([]);
  });
});
