import { Service } from '../../../../domain/services/service.js';
import { BillingDay } from '../../../../domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../../domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../../domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../../domain/services/value-objects/service-id.js';
import {
  ServiceLifecycleStatus,
  type ServiceLifecycleStatusValue,
} from '../../../../domain/services/value-objects/service-lifecycle-status.js';
import {
  ServiceType,
  type ServiceTypeValue,
} from '../../../../domain/services/value-objects/service-type.js';

export interface InMemoryServiceRecord {
  billingDay: number;
  clientId: string;
  companyId: string;
  createdAt: string;
  id: string;
  lifecycleStatus: ServiceLifecycleStatusValue;
  planVersionId: string;
  serviceType: ServiceTypeValue;
  startedOn: string | undefined;
}

export const inMemoryServiceMapper = {
  toRecord(service: Service): InMemoryServiceRecord {
    return {
      billingDay: service.billingDay.value,
      clientId: service.clientId.value,
      companyId: service.companyId,
      createdAt: service.createdAt.toISOString(),
      id: service.id.value,
      lifecycleStatus: service.lifecycleStatus.value,
      planVersionId: service.planVersionId.value,
      serviceType: service.serviceType.value,
      startedOn: service.startedOn?.toISOString(),
    };
  },

  toDomain(record: InMemoryServiceRecord): Service {
    return Service.rehydrate({
      billingDay: BillingDay.create(record.billingDay),
      clientId: ClientReferenceId.create(record.clientId),
      companyId: record.companyId,
      createdAt: new Date(record.createdAt),
      id: ServiceId.create(record.id),
      lifecycleStatus: ServiceLifecycleStatus.create(record.lifecycleStatus),
      planVersionId: PlanVersionId.create(record.planVersionId),
      serviceType: ServiceType.create(record.serviceType),
      startedOn: record.startedOn === undefined ? undefined : new Date(record.startedOn),
    });
  },
};
