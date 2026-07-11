import type { ArchiveClientInput } from '../../../dto/clients/client.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';
import { ClientNotFoundError } from '../../../../domain/clients/errors/client-not-found.error.js';
import { ClientId } from '../../../../domain/clients/value-objects/client-id.js';

export class ArchiveClient {
  public constructor(
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}

  public async execute(input: ArchiveClientInput): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const clientId = ClientId.create(input.clientId);
    const client = await this.clientRepository.findById(companyId, clientId.value);

    if (client === null) {
      throw new ClientNotFoundError();
    }

    client.archive(this.clock.now());
    await this.clientRepository.save(client);
  }
}
