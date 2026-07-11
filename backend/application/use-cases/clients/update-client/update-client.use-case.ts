import {
  type ClientDto,
  type UpdateClientInput,
  toClientDto,
} from '../../../dto/clients/client.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';
import { ClientNotFoundError } from '../../../../domain/clients/errors/client-not-found.error.js';
import { ClientAddress } from '../../../../domain/clients/value-objects/client-address.js';
import { ClientContact } from '../../../../domain/clients/value-objects/client-contact.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';
import { LegalName } from '../../../../domain/clients/value-objects/legal-name.js';

export class UpdateClient {
  public constructor(
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}

  public async execute(input: UpdateClientInput): Promise<ClientDto> {
    const companyId = this.companyContext.getCompanyId();
    const clientId = ClientId.create(input.clientId);
    const client = await this.clientRepository.findById(companyId, clientId.value);

    if (client === null) {
      throw new ClientNotFoundError();
    }

    client.update({
      ...(input.addresses === undefined
        ? {}
        : { addresses: input.addresses.map((address) => ClientAddress.create(address)) }),
      ...(input.contacts === undefined
        ? {}
        : { contacts: input.contacts.map((contact) => ClientContact.create(contact)) }),
      ...(input.legalName === undefined ? {} : { legalName: LegalName.create(input.legalName) }),
      updatedAt: this.clock.now(),
    });

    await this.clientRepository.save(client);
    return toClientDto(client);
  }
}
