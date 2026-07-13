import { Client } from '../../../../domain/clients/client.js';
import { ClientAddress } from '../../../../domain/clients/value-objects/client-address.js';
import { ClientContact } from '../../../../domain/clients/value-objects/client-contact.js';
import { ClientDocument } from '../../../../domain/clients/value-objects/client-document.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';
import { ClientNote } from '../../../../domain/clients/value-objects/client-note.js';
import { ClientType } from '../../../../domain/clients/value-objects/client-type.js';
import { LegalName } from '../../../../domain/clients/value-objects/legal-name.js';
import type {
  ClientAddressTable,
  ClientContactTable,
  ClientNoteTable,
  ClientTable,
} from '../../sqlite/database-schema.js';

export const sqliteClientMapper = {
  toDomain(
    client: ClientTable,
    contacts: readonly ClientContactTable[],
    addresses: readonly ClientAddressTable[],
    notes: readonly ClientNoteTable[],
  ): Client {
    const note = notes[0];
    return Client.rehydrate({
      addresses: [...addresses]
        .sort((left, right) => left.position - right.position)
        .map((address) =>
          ClientAddress.create({
            addressLine: address.address_line,
            isServiceAddress: address.is_service_address === 1,
            ...(address.label === null ? {} : { label: address.label }),
            ...(address.latitude === null ? {} : { latitude: address.latitude }),
            ...(address.longitude === null ? {} : { longitude: address.longitude }),
          }),
        ),
      archivedAt: client.archived_at === null ? undefined : new Date(client.archived_at),
      clientType: ClientType.create(client.client_type),
      companyId: client.company_id,
      contacts: [...contacts]
        .sort((left, right) => left.position - right.position)
        .map((contact) =>
          ClientContact.create({
            isPrimary: contact.is_primary === 1,
            type: contact.contact_type as 'phone' | 'email' | 'whatsapp',
            value: contact.value_display,
          }),
        ),
      createdAt: new Date(client.created_at),
      document: ClientDocument.create(client.document_type, client.document_number),
      id: ClientId.create(client.id),
      legalName: LegalName.create(client.legal_name),
      note: note === undefined ? undefined : ClientNote.create(note.body),
      status: client.status,
      updatedAt: client.updated_at === null ? undefined : new Date(client.updated_at),
    });
  },
};
