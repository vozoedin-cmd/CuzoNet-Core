import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ProvisioningOperationReader } from '../../../ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../ports/provisioning/provisioning-operation-repository.port.js';
import { ProvisioningOperationNotFoundError } from '../../../../domain/provisioning/errors/provisioning-operation-not-found.error.js';

export class CancelProvisioningOperation {
  public constructor(
    private readonly repository: ProvisioningOperationRepository,
    private readonly reader: ProvisioningOperationReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(operationId: string): Promise<void> {
    const operation = await this.reader.findById(this.companyContext.getCompanyId(), operationId);
    if (operation === null) throw new ProvisioningOperationNotFoundError();
    operation.cancel();
    await this.repository.save(operation);
  }
}
