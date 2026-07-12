import type { ServiceLifecycleStatusValue } from '../../../domain/services/value-objects/service-lifecycle-status.js';
export interface BillingServiceSnapshot {
  clientId: string;
  companyId: string;
  lifecycleStatus: ServiceLifecycleStatusValue;
  serviceId: string;
}
export interface ServiceBillingReader {
  findById(companyId: string, serviceId: string): Promise<BillingServiceSnapshot | null>;
}
