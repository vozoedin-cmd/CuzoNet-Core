import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ProvisioningOperationReader } from '../../../ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../ports/provisioning/provisioning-operation-repository.port.js';
import type { ProvisioningUnitOfWork } from '../../../ports/provisioning/provisioning-unit-of-work.port.js';
import type { ServiceLifecyclePort } from '../../../ports/provisioning/service-lifecycle.port.js';
import { ProvisioningOperationNotFoundError } from '../../../../domain/provisioning/errors/provisioning-operation-not-found.error.js';

export class CompleteProvisioningOperation {
  public constructor(
    private readonly repository: ProvisioningOperationRepository,
    private readonly reader: ProvisioningOperationReader,
    private readonly serviceLifecycle: ServiceLifecyclePort,
    private readonly unitOfWork: ProvisioningUnitOfWork,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(operationId: string): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const operation = await this.reader.findById(companyId, operationId);
    if (operation === null) throw new ProvisioningOperationNotFoundError();
    const completedAt = this.clock.now();
    operation.complete(completedAt);
    await this.unitOfWork.execute(async () => {
      await this.repository.save(operation);
      await this.serviceLifecycle.activate(companyId, operation.serviceId, completedAt);
    });
  }
}
