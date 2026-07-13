import { Service } from '../../../../domain/services/service.js';
import { BillingDay } from '../../../../domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../../domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../../domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../../domain/services/value-objects/service-id.js';
import { ServiceLifecycleStatus } from '../../../../domain/services/value-objects/service-lifecycle-status.js';
import { ServiceType } from '../../../../domain/services/value-objects/service-type.js';
import type { ClientServiceTable } from '../../sqlite/database-schema.js';

export const sqliteServiceMapper = {
  toDomain(record: ClientServiceTable): Service {
    return Service.rehydrate({
      billingDay: BillingDay.create(record.billing_day),
      clientId: ClientReferenceId.create(record.client_id),
      companyId: record.company_id,
      createdAt: new Date(record.created_at),
      id: ServiceId.create(record.id),
      lifecycleStatus: ServiceLifecycleStatus.create(record.lifecycle_status),
      planVersionId: PlanVersionId.create(record.plan_version_id),
      serviceType: ServiceType.create(record.service_type),
      startedOn: record.started_on === null ? undefined : new Date(record.started_on),
    });
  },
};
