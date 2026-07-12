import type { ServiceLifecycleStatusValue } from '../../../domain/services/value-objects/service-lifecycle-status.js';
import type { ServiceTypeValue } from '../../../domain/services/value-objects/service-type.js';

export interface ProvisioningServiceSnapshot {
  companyId: string;
  lifecycleStatus: ServiceLifecycleStatusValue;
  planVersionId: string;
  serviceId: string;
  serviceType: ServiceTypeValue;
}

export interface ServiceProvisioningReader {
  findById(companyId: string, serviceId: string): Promise<ProvisioningServiceSnapshot | null>;
}
