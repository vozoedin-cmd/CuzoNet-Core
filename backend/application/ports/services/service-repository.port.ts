import type { Service } from '../../../domain/services/service.js';

export interface ServiceRepository {
  save(service: Service): Promise<void>;
}
