import { describe, expect, it } from 'vitest';

import { Client } from '../../../../backend/domain/clients/client.js';
import { ClientContact } from '../../../../backend/domain/clients/value-objects/client-contact.js';
import { ClientDocument } from '../../../../backend/domain/clients/value-objects/client-document.js';
import { ClientId } from '../../../../backend/domain/clients/value-objects/client-id.js';
import { ClientType } from '../../../../backend/domain/clients/value-objects/client-type.js';
import { LegalName } from '../../../../backend/domain/clients/value-objects/legal-name.js';

const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10';
const eventId = '01890f2e-7b2a-7cc0-9b9a-7e6b4f3a2c11';
const createdAt = new Date('2026-07-11T10:00:00.000Z');

function createClient(contacts: readonly ClientContact[] = []): Client {
  return Client.create({
    addresses: [],
    causationId: 'create-client-request',
    clientType: ClientType.create('person'),
    companyId: 'company-one',
    contacts,
    correlationId: 'correlation-one',
    createdAt,
    document: ClientDocument.create('dpi', '1234567890101'),
    eventId,
    id: ClientId.create(clientId),
    legalName: LegalName.create('Ana López'),
    note: undefined,
  });
}

describe('Client aggregate', () => {
  it('crea un cliente activo y registra únicamente ClientCreated.v1', () => {
    const client = createClient();
    const events = client.pullDomainEvents();

    expect(client.status).toBe('active');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateId: clientId,
      aggregateType: 'Client',
      eventId,
      eventType: 'ClientCreated.v1',
      schemaVersion: 1,
    });
    expect(client.pullDomainEvents()).toEqual([]);
  });

  it('impide dos contactos primarios del mismo tipo', () => {
    const contacts = [
      ClientContact.create({ isPrimary: true, type: 'phone', value: '+50255550001' }),
      ClientContact.create({ isPrimary: true, type: 'phone', value: '+50255550002' }),
    ];

    expect(() => createClient(contacts)).toThrow('Los datos del cliente no son válidos.');
  });

  it('actualiza datos administrativos y archiva sin emitir eventos no catalogados', () => {
    const client = createClient();
    client.pullDomainEvents();

    client.update({
      legalName: LegalName.create('Ana López Pérez'),
      updatedAt: new Date('2026-07-11T11:00:00.000Z'),
    });
    client.archive(new Date('2026-07-11T12:00:00.000Z'));

    expect(client.legalName.value).toBe('Ana López Pérez');
    expect(client.status).toBe('archived');
    expect(client.archivedAt?.toISOString()).toBe('2026-07-11T12:00:00.000Z');
    expect(client.pullDomainEvents()).toEqual([]);
  });
});
