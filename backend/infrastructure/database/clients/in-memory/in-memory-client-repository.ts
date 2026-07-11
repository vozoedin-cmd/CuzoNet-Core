import type {
  ClientPage,
  ClientRepository,
  ListClientsCriteria,
} from '../../../../application/ports/clients/client-repository.port.js';
import type { Client } from '../../../../domain/clients/client.js';
import { inMemoryClientMapper, type InMemoryClientRecord } from './in-memory-client.mapper.js';

export class InMemoryClientRepository implements ClientRepository {
  private readonly records = new Map<string, InMemoryClientRecord>();

  public existsActiveDocument(companyId: string, documentKey: string): Promise<boolean> {
    const exists = [...this.records.values()].some(
      (record) =>
        record.companyId === companyId &&
        record.documentKey === documentKey &&
        record.status === 'active',
    );
    return Promise.resolve(exists);
  }

  public findById(companyId: string, clientId: string): Promise<Client | null> {
    const record = this.records.get(this.key(companyId, clientId));
    return Promise.resolve(record === undefined ? null : inMemoryClientMapper.toDomain(record));
  }

  public list(criteria: ListClientsCriteria): Promise<ClientPage> {
    const normalizedSearch = criteria.search?.trim().toLowerCase();
    const records = [...this.records.values()]
      .filter((record) => record.companyId === criteria.companyId)
      .filter((record) => criteria.status === undefined || record.status === criteria.status)
      .filter((record) => {
        if (normalizedSearch === undefined || normalizedSearch.length === 0) {
          return true;
        }

        return (
          record.legalName.toLowerCase().includes(normalizedSearch) ||
          record.documentNumber.toLowerCase().includes(normalizedSearch) ||
          record.contacts.some((contact) =>
            contact.normalizedValue.toLowerCase().includes(normalizedSearch),
          )
        );
      })
      .sort((left, right) => {
        const createdAtComparison = right.createdAt.localeCompare(left.createdAt);
        return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
      });

    const offset = (criteria.page - 1) * criteria.pageSize;
    return Promise.resolve({
      clients: records
        .slice(offset, offset + criteria.pageSize)
        .map((record) => inMemoryClientMapper.toDomain(record)),
      total: records.length,
    });
  }

  public save(client: Client): Promise<void> {
    this.records.set(
      this.key(client.companyId, client.id.value),
      inMemoryClientMapper.toRecord(client),
    );
    return Promise.resolve();
  }

  private key(companyId: string, clientId: string): string {
    return `${companyId}:${clientId}`;
  }
}
