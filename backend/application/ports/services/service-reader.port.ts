import type { Service } from '../../../domain/services/service.js';

export interface ServiceReader {
  findById(companyId: string, serviceId: string): Promise<Service | null>;
  listByClient(companyId: string, clientId: string): Promise<readonly Service[]>;
}
