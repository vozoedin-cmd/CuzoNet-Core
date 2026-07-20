import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { Clock } from '../../../ports/clock.port.js';

export interface CancelProvisioningRequestInput {
  requestId: string;
}

export class CancelProvisioningRequest {
  public constructor(
    private readonly repository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}

  public async execute(input: CancelProvisioningRequestInput): Promise<void> {
    const request = await this.repository.findById(input.requestId);
    if (!request) {
      throw new Error(`ProvisioningRequest no encontrado: ${input.requestId}`);
    }

    if (request.companyId !== this.companyContext.getCompanyId()) {
      throw new Error(`ProvisioningRequest no pertenece a la compañía actual.`);
    }

    request.cancel(this.clock.now());
    await this.repository.save(request);
  }
}
