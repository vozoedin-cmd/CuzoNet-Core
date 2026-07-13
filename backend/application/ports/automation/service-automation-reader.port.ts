import type { ServiceLifecycleStatusValue } from '../../../domain/services/value-objects/service-lifecycle-status.js';
export interface ServiceAutomationFacts {
  lifecycleStatus: ServiceLifecycleStatusValue;
  serviceId: string;
}
export interface ServiceAutomationReader {
  findFacts(companyId: string, serviceId: string): Promise<ServiceAutomationFacts | null>;
}
