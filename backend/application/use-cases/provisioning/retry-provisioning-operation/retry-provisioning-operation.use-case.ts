import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ProvisioningOperationReader } from '../../../ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../ports/provisioning/provisioning-operation-repository.port.js';
import type { RetryPolicy } from '../../../ports/provisioning/retry-policy.port.js';
import { ProvisioningOperationNotFoundError } from '../../../../domain/provisioning/errors/provisioning-operation-not-found.error.js';

export class RetryProvisioningOperation {
  public constructor(
    private readonly repository: ProvisioningOperationRepository,
    private readonly reader: ProvisioningOperationReader,
    private readonly retryPolicy: RetryPolicy,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(operationId: string): Promise<void> {
    const operation = await this.reader.findById(this.companyContext.getCompanyId(), operationId);
    if (operation === null) throw new ProvisioningOperationNotFoundError();
    const code = operation.lastErrorCode;
    if (code === undefined || !this.retryPolicy.isRetryable(code)) operation.requireManualReview();
    else operation.retry(this.retryPolicy.nextAttemptAt(operation.attemptCount, this.clock.now()));
    await this.repository.save(operation);
  }
}
