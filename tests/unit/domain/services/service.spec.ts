import { describe, expect, it } from 'vitest';

import { Service } from '../../../../backend/domain/services/service.js';
import { BillingDay } from '../../../../backend/domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../../backend/domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../../backend/domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../../backend/domain/services/value-objects/service-id.js';
import {
  ServiceLifecycleStatus,
  serviceLifecycleStatuses,
} from '../../../../backend/domain/services/value-objects/service-lifecycle-status.js';
import { ServiceType } from '../../../../backend/domain/services/value-objects/service-type.js';

const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c21';
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22';
const eventId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c23';
const createdAt = new Date('2026-07-11T15:00:00.000Z');

function createService(): Service {
  return Service.create({
    billingDay: BillingDay.create(15),
    causationId: 'create-service-0001',
    clientId: ClientReferenceId.create(clientId),
    companyId: 'company-one',
    correlationId: 'correlation-one',
    createdAt,
    eventId,
    id: ServiceId.create(serviceId),
    planVersionId: PlanVersionId.create(planVersionId),
    serviceType: ServiceType.create('simple_queue'),
  });
}

describe('Service aggregate', () => {
  it('crea un Service pending, conserva createdAt y registra ServiceCreated.v1', () => {
    const service = createService();
    const events = service.pullDomainEvents();

    expect(service.lifecycleStatus.value).toBe('pending');
    expect(service.createdAt.toISOString()).toBe('2026-07-11T15:00:00.000Z');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateId: serviceId,
      aggregateType: 'Service',
      eventId,
      eventType: 'ServiceCreated.v1',
      schemaVersion: 1,
    });
    expect(service.pullDomainEvents()).toEqual([]);
  });

  it('define exactamente los estados de ciclo de vida aprobados', () => {
    expect(serviceLifecycleStatuses).toEqual([
      'pending',
      'active',
      'suspended',
      'cancelled',
      'archived',
    ]);
    expect(ServiceLifecycleStatus.create('archived').value).toBe('archived');
    expect(() => ServiceLifecycleStatus.create('failed')).toThrow(
      'Los datos del servicio no son válidos.',
    );
  });

  it('rechaza un billingDay fuera del rango contractual', () => {
    expect(() => BillingDay.create(29)).toThrow('Los datos del servicio no son válidos.');
  });
});
