import {
  type ClientPageDto,
  type ListClientsInput,
  toClientDto,
} from '../../../dto/clients/client.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';

export class ListClients {
  public constructor(
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(input: ListClientsInput): Promise<ClientPageDto> {
    const result = await this.clientRepository.list({
      companyId: this.companyContext.getCompanyId(),
      page: input.page,
      pageSize: input.pageSize,
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      data: result.clients.map(toClientDto),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }
}
