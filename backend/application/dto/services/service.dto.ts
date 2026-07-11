import type { Service } from '../../../domain/services/service.js';
import type { ServiceCreatedEvent } from '../../../domain/services/events/service-created.event.js';
import type { ServiceLifecycleStatusValue } from '../../../domain/services/value-objects/service-lifecycle-status.js';
import type { ServiceTypeValue } from '../../../domain/services/value-objects/service-type.js';

export interface CreateServiceInput {
  billingDay: number;
  causationId: string;
  clientId: string;
  correlationId: string;
  planVersionId: string;
  serviceType: ServiceTypeValue;
}

export interface GetServiceInput {
  serviceId: string;
}

export interface ListClientServicesInput {
  clientId: string;
}

export interface ServiceDto {
  billingDay: number;
  clientId: string;
  id: string;
  lifecycleStatus: ServiceLifecycleStatusValue;
  planVersionId: string;
  serviceType: ServiceTypeValue;
  startedOn?: string;
}

export interface CreateServiceResult {
  domainEvents: readonly ServiceCreatedEvent[];
  service: ServiceDto;
}

export function toServiceDto(service: Service): ServiceDto {
  const startedOn = service.startedOn;

  return {
    billingDay: service.billingDay.value,
    clientId: service.clientId.value,
    id: service.id.value,
    lifecycleStatus: service.lifecycleStatus.value,
    planVersionId: service.planVersionId.value,
    serviceType: service.serviceType.value,
    ...(startedOn === undefined ? {} : { startedOn: startedOn.toISOString().slice(0, 10) }),
  };
}
