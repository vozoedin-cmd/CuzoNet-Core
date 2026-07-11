import { Client } from '../../../../domain/clients/client.js';
import { ClientAddress } from '../../../../domain/clients/value-objects/client-address.js';
import { ClientContact } from '../../../../domain/clients/value-objects/client-contact.js';
import { ClientDocument } from '../../../../domain/clients/value-objects/client-document.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';
import { ClientNote } from '../../../../domain/clients/value-objects/client-note.js';
import type { ClientStatus } from '../../../../domain/clients/value-objects/client-status.js';
import {
  ClientType,
  type ClientTypeValue,
} from '../../../../domain/clients/value-objects/client-type.js';
import { LegalName } from '../../../../domain/clients/value-objects/legal-name.js';

export interface InMemoryClientRecord {
  addresses: readonly {
    addressLine: string;
    isServiceAddress: boolean;
    label?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  }[];
  archivedAt: string | undefined;
  clientType: ClientTypeValue;
  companyId: string;
  contacts: readonly {
    isPrimary: boolean;
    normalizedValue: string;
    type: 'phone' | 'email' | 'whatsapp';
    value: string;
  }[];
  createdAt: string;
  documentKey: string;
  documentNumber: string;
  documentType: string;
  id: string;
  legalName: string;
  note: string | undefined;
  status: ClientStatus;
  updatedAt: string | undefined;
}

export const inMemoryClientMapper = {
  toRecord(client: Client): InMemoryClientRecord {
    return {
      addresses: client.addresses.map((address) => address.toPrimitives()),
      archivedAt: client.archivedAt?.toISOString(),
      clientType: client.clientType.value,
      companyId: client.companyId,
      contacts: client.contacts.map((contact) => ({
        ...contact.toPrimitives(),
        normalizedValue: contact.normalizedValue,
      })),
      createdAt: client.createdAt.toISOString(),
      documentKey: client.document.uniquenessKey,
      documentNumber: client.document.number,
      documentType: client.document.type,
      id: client.id.value,
      legalName: client.legalName.value,
      note: client.note?.value,
      status: client.status,
      updatedAt: client.updatedAt?.toISOString(),
    };
  },

  toDomain(record: InMemoryClientRecord): Client {
    return Client.rehydrate({
      addresses: record.addresses.map((address) => ClientAddress.create(address)),
      archivedAt: record.archivedAt === undefined ? undefined : new Date(record.archivedAt),
      clientType: ClientType.create(record.clientType),
      companyId: record.companyId,
      contacts: record.contacts.map((contact) => ClientContact.create(contact)),
      createdAt: new Date(record.createdAt),
      document: ClientDocument.create(record.documentType, record.documentNumber),
      id: ClientId.create(record.id),
      legalName: LegalName.create(record.legalName),
      note: record.note === undefined ? undefined : ClientNote.create(record.note),
      status: record.status,
      updatedAt: record.updatedAt === undefined ? undefined : new Date(record.updatedAt),
    });
  },
};
