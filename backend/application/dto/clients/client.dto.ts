import type { Client } from '../../../domain/clients/client.js';
import type { ClientCreatedEvent } from '../../../domain/clients/events/client-created.event.js';
import type { ClientAddressPrimitives } from '../../../domain/clients/value-objects/client-address.js';
import type { ClientContactPrimitives } from '../../../domain/clients/value-objects/client-contact.js';
import type { ClientStatus } from '../../../domain/clients/value-objects/client-status.js';
import type { ClientTypeValue } from '../../../domain/clients/value-objects/client-type.js';

export interface CreateClientInput {
  addresses?: readonly ClientAddressPrimitives[] | undefined;
  causationId: string;
  clientType: ClientTypeValue;
  contacts?: readonly ClientContactPrimitives[] | undefined;
  correlationId: string;
  documentNumber: string;
  documentType: string;
  legalName: string;
  note?: string | undefined;
}

export interface UpdateClientInput {
  addresses?: readonly ClientAddressPrimitives[] | undefined;
  clientId: string;
  contacts?: readonly ClientContactPrimitives[] | undefined;
  legalName?: string | undefined;
}

export interface GetClientInput {
  clientId: string;
}

export interface ArchiveClientInput {
  clientId: string;
}

export interface ListClientsInput {
  page: number;
  pageSize: number;
  search?: string | undefined;
  status?: ClientStatus | undefined;
}

export interface ClientDto {
  addresses: readonly ClientAddressPrimitives[];
  clientType: ClientTypeValue;
  contacts: readonly ClientContactPrimitives[];
  createdAt: string;
  documentNumber: string;
  documentType: string;
  id: string;
  legalName: string;
  status: ClientStatus;
  updatedAt?: string;
}

export interface ClientPageDto {
  data: readonly ClientDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateClientResult {
  client: ClientDto;
  domainEvents: readonly ClientCreatedEvent[];
}

export function toClientDto(client: Client): ClientDto {
  const updatedAt = client.updatedAt;

  return {
    addresses: client.addresses.map((address) => address.toPrimitives()),
    clientType: client.clientType.value,
    contacts: client.contacts.map((contact) => contact.toPrimitives()),
    createdAt: client.createdAt.toISOString(),
    documentNumber: client.document.number,
    documentType: client.document.type,
    id: client.id.value,
    legalName: client.legalName.value,
    status: client.status,
    ...(updatedAt === undefined ? {} : { updatedAt: updatedAt.toISOString() }),
  };
}
