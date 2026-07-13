import {
  type CreateClientInput,
  type CreateClientResult,
  toClientDto,
} from '../../../dto/clients/client.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';
import type {
  ClientOutboxPort,
  ClientUnitOfWork,
} from '../../../ports/clients/client-outbox.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import { Client } from '../../../../domain/clients/client.js';
import { DuplicateClientDocumentError } from '../../../../domain/clients/errors/duplicate-client-document.error.js';
import { ClientAddress } from '../../../../domain/clients/value-objects/client-address.js';
import { ClientContact } from '../../../../domain/clients/value-objects/client-contact.js';
import { ClientDocument } from '../../../../domain/clients/value-objects/client-document.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';
import { ClientNote } from '../../../../domain/clients/value-objects/client-note.js';
import { ClientType } from '../../../../domain/clients/value-objects/client-type.js';
import { LegalName } from '../../../../domain/clients/value-objects/legal-name.js';

export class CreateClient {
  public constructor(
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly outbox: ClientOutboxPort = { append: () => Promise.resolve() },
    private readonly unitOfWork: ClientUnitOfWork = { execute: (work) => work() },
  ) {}

  public async execute(input: CreateClientInput): Promise<CreateClientResult> {
    const companyId = this.companyContext.getCompanyId();
    const document = ClientDocument.create(input.documentType, input.documentNumber);

    if (await this.clientRepository.existsActiveDocument(companyId, document.uniquenessKey)) {
      throw new DuplicateClientDocumentError();
    }

    const now = this.clock.now();
    const client = Client.create({
      addresses: (input.addresses ?? []).map((address) => ClientAddress.create(address)),
      causationId: input.causationId,
      clientType: ClientType.create(input.clientType),
      companyId,
      contacts: (input.contacts ?? []).map((contact) => ClientContact.create(contact)),
      correlationId: input.correlationId,
      createdAt: now,
      document,
      eventId: this.idGenerator.generate(),
      id: ClientId.create(this.idGenerator.generate()),
      legalName: LegalName.create(input.legalName),
      note: input.note === undefined ? undefined : ClientNote.create(input.note),
    });

    const domainEvents = client.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.clientRepository.save(client);
      await this.outbox.append(domainEvents);
    });

    return {
      client: toClientDto(client),
      domainEvents,
    };
  }
}
