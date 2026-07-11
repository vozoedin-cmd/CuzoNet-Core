import { InvalidClientDataError } from './errors/invalid-client-data.error.js';
import { ClientCreatedEvent } from './events/client-created.event.js';
import type { ClientAddress } from './value-objects/client-address.js';
import type { ClientContact } from './value-objects/client-contact.js';
import type { ClientDocument } from './value-objects/client-document.js';
import type { ClientId } from './value-objects/client-id.js';
import type { ClientNote } from './value-objects/client-note.js';
import type { ClientStatus } from './value-objects/client-status.js';
import type { ClientType } from './value-objects/client-type.js';
import type { LegalName } from './value-objects/legal-name.js';

export interface ClientHydrationProps {
  addresses: readonly ClientAddress[];
  archivedAt: Date | undefined;
  clientType: ClientType;
  companyId: string;
  contacts: readonly ClientContact[];
  createdAt: Date;
  document: ClientDocument;
  id: ClientId;
  legalName: LegalName;
  note: ClientNote | undefined;
  status: ClientStatus;
  updatedAt: Date | undefined;
}

export interface CreateClientProps {
  addresses: readonly ClientAddress[];
  causationId: string;
  clientType: ClientType;
  companyId: string;
  contacts: readonly ClientContact[];
  correlationId: string;
  createdAt: Date;
  document: ClientDocument;
  eventId: string;
  id: ClientId;
  legalName: LegalName;
  note: ClientNote | undefined;
}

export interface UpdateClientProps {
  addresses?: readonly ClientAddress[];
  contacts?: readonly ClientContact[];
  legalName?: LegalName;
  updatedAt: Date;
}

export class Client {
  private readonly domainEvents: ClientCreatedEvent[] = [];
  private addressesValue: ClientAddress[];
  private archivedAtValue: Date | undefined;
  private contactsValue: ClientContact[];
  private legalNameValue: LegalName;
  private statusValue: ClientStatus;
  private updatedAtValue: Date | undefined;

  private constructor(private readonly props: ClientHydrationProps) {
    Client.validateAddresses(props.addresses);
    Client.validateContacts(props.contacts);
    this.addressesValue = [...props.addresses];
    this.archivedAtValue = props.archivedAt;
    this.contactsValue = [...props.contacts];
    this.legalNameValue = props.legalName;
    this.statusValue = props.status;
    this.updatedAtValue = props.updatedAt;
  }

  public static create(props: CreateClientProps): Client {
    const client = new Client({
      addresses: props.addresses,
      archivedAt: undefined,
      clientType: props.clientType,
      companyId: props.companyId,
      contacts: props.contacts,
      createdAt: props.createdAt,
      document: props.document,
      id: props.id,
      legalName: props.legalName,
      note: props.note,
      status: 'active',
      updatedAt: undefined,
    });

    client.domainEvents.push(
      new ClientCreatedEvent({
        aggregateId: props.id.value,
        causationId: props.causationId,
        clientType: props.clientType.value,
        companyId: props.companyId,
        correlationId: props.correlationId,
        eventId: props.eventId,
        occurredAt: props.createdAt,
      }),
    );

    return client;
  }

  public static rehydrate(props: ClientHydrationProps): Client {
    return new Client(props);
  }

  public update(props: UpdateClientProps): void {
    const contacts = props.contacts === undefined ? this.contactsValue : [...props.contacts];
    const addresses = props.addresses === undefined ? this.addressesValue : [...props.addresses];
    Client.validateAddresses(addresses);
    Client.validateContacts(contacts);

    this.contactsValue = contacts;
    this.addressesValue = addresses;
    this.legalNameValue = props.legalName ?? this.legalNameValue;
    this.updatedAtValue = props.updatedAt;
  }

  public archive(archivedAt: Date): void {
    if (this.statusValue === 'archived') {
      return;
    }

    this.statusValue = 'archived';
    this.archivedAtValue = archivedAt;
    this.updatedAtValue = archivedAt;
  }

  public pullDomainEvents(): readonly ClientCreatedEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private static validateContacts(contacts: readonly ClientContact[]): void {
    if (contacts.length > 10) {
      throw new InvalidClientDataError('contacts', 'No puede contener más de 10 contactos.');
    }

    const primaryTypes = new Set<string>();
    for (const contact of contacts) {
      if (!contact.isPrimary) {
        continue;
      }

      if (primaryTypes.has(contact.type)) {
        throw new InvalidClientDataError(
          'contacts',
          'Solo puede existir un contacto primario por tipo.',
        );
      }
      primaryTypes.add(contact.type);
    }
  }

  private static validateAddresses(addresses: readonly ClientAddress[]): void {
    if (addresses.length > 10) {
      throw new InvalidClientDataError('addresses', 'No puede contener más de 10 direcciones.');
    }
  }

  public get id(): ClientId {
    return this.props.id;
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get clientType(): ClientType {
    return this.props.clientType;
  }

  public get document(): ClientDocument {
    return this.props.document;
  }

  public get legalName(): LegalName {
    return this.legalNameValue;
  }

  public get contacts(): readonly ClientContact[] {
    return [...this.contactsValue];
  }

  public get addresses(): readonly ClientAddress[] {
    return [...this.addressesValue];
  }

  public get note(): ClientNote | undefined {
    return this.props.note;
  }

  public get status(): ClientStatus {
    return this.statusValue;
  }

  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }

  public get updatedAt(): Date | undefined {
    return this.updatedAtValue === undefined ? undefined : new Date(this.updatedAtValue);
  }

  public get archivedAt(): Date | undefined {
    return this.archivedAtValue === undefined ? undefined : new Date(this.archivedAtValue);
  }
}
