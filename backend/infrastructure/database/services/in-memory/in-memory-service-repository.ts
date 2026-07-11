import type { ServiceReader } from '../../../../application/ports/services/service-reader.port.js';
import type { ServiceRepository } from '../../../../application/ports/services/service-repository.port.js';
import type { Service } from '../../../../domain/services/service.js';
import { inMemoryServiceMapper, type InMemoryServiceRecord } from './in-memory-service.mapper.js';

export class InMemoryServiceRepository implements ServiceRepository, ServiceReader {
  private readonly records = new Map<string, InMemoryServiceRecord>();

  public save(service: Service): Promise<void> {
    this.records.set(
      this.key(service.companyId, service.id.value),
      inMemoryServiceMapper.toRecord(service),
    );
    return Promise.resolve();
  }

  public findById(companyId: string, serviceId: string): Promise<Service | null> {
    const record = this.records.get(this.key(companyId, serviceId));
    return Promise.resolve(record === undefined ? null : inMemoryServiceMapper.toDomain(record));
  }

  public listByClient(companyId: string, clientId: string): Promise<readonly Service[]> {
    const services = [...this.records.values()]
      .filter((record) => record.companyId === companyId && record.clientId === clientId)
      .sort((left, right) => {
        const createdAtComparison = right.createdAt.localeCompare(left.createdAt);
        return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
      })
      .map((record) => inMemoryServiceMapper.toDomain(record));

    return Promise.resolve(services);
  }

  private key(companyId: string, serviceId: string): string {
    return `${companyId}:${serviceId}`;
  }
}
