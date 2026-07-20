import type { ProvisioningRequestDto } from '../../../dto/provisioning/provisioning-request.dto.js';
import type { ProvisioningRequestFilters, ProvisioningRequestPagination, ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';

export interface ListProvisioningRequestsResult {
  items: readonly ProvisioningRequestDto[];
  total: number;
}

export class ListProvisioningRequests {
  public constructor(
    private readonly repository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(
    filters: Omit<ProvisioningRequestFilters, 'companyId'>,
    pagination: ProvisioningRequestPagination,
  ): Promise<ListProvisioningRequestsResult> {
    const fullFilters = {
      ...filters,
      companyId: this.companyContext.getCompanyId(),
    };

    const { items, total } = await this.repository.list(fullFilters, pagination);

    return {
      items: items.map(req => req.toDto()),
      total,
    };
  }
}
