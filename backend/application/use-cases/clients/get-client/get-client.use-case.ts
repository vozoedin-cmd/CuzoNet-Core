import {
  type ClientDto,
  type GetClientInput,
  toClientDto,
} from '../../../dto/clients/client.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';
import { ClientNotFoundError } from '../../../../domain/clients/errors/client-not-found.error.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';

export class GetClient {
  public constructor(
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(input: GetClientInput): Promise<ClientDto> {
    const companyId = this.companyContext.getCompanyId();
    const clientId = ClientId.create(input.clientId);
    const client = await this.clientRepository.findById(companyId, clientId.value);

    if (client === null) {
      throw new ClientNotFoundError();
    }

    return toClientDto(client);
  }
}
