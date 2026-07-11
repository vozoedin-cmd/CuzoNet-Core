import type { Client } from '../../../domain/clients/client.js';
import type { ClientStatus } from '../../../domain/clients/value-objects/client-status.js';

export interface ListClientsCriteria {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: ClientStatus;
}

export interface ClientPage {
  clients: readonly Client[];
  total: number;
}

export interface ClientRepository {
  existsActiveDocument(companyId: string, documentKey: string): Promise<boolean>;
  findById(companyId: string, clientId: string): Promise<Client | null>;
  list(criteria: ListClientsCriteria): Promise<ClientPage>;
  save(client: Client): Promise<void>;
}
