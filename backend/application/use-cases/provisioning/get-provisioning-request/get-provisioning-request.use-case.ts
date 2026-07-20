import type { ProvisioningRequestDto } from '../../../dto/provisioning/provisioning-request.dto.js';
import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';

export class GetProvisioningRequest {
  public constructor(
    private readonly repository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(id: string): Promise<ProvisioningRequestDto | undefined> {
    const request = await this.repository.findById(id);
    if (!request || request.companyId !== this.companyContext.getCompanyId()) {
      return undefined;
    }
    return request.toDto();
  }
}
