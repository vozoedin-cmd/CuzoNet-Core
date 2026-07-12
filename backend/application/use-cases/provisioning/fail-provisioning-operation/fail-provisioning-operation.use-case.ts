import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { OutboxPort } from '../../../ports/provisioning/outbox.port.js';
import type { ProvisioningOperationReader } from '../../../ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../ports/provisioning/provisioning-operation-repository.port.js';
import type { ProvisioningUnitOfWork } from '../../../ports/provisioning/provisioning-unit-of-work.port.js';
import { ProvisioningOperationNotFoundError } from '../../../../domain/provisioning/errors/provisioning-operation-not-found.error.js';
import { OperationFailure } from '../../../../domain/provisioning/value-objects/operation-failure.js';

export class FailProvisioningOperation {
  public constructor(
    private readonly repository: ProvisioningOperationRepository,
    private readonly reader: ProvisioningOperationReader,
    private readonly outbox: OutboxPort,
    private readonly unitOfWork: ProvisioningUnitOfWork,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: {
    errorCode: string;
    errorMessage: string;
    operationId: string;
  }): Promise<void> {
    const operation = await this.reader.findById(
      this.companyContext.getCompanyId(),
      input.operationId,
    );
    if (operation === null) throw new ProvisioningOperationNotFoundError();
    operation.fail({
      eventId: this.idGenerator.generate(),
      failure: OperationFailure.create(input.errorCode, input.errorMessage),
      occurredAt: this.clock.now(),
    });
    const events = operation.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.repository.save(operation);
      await this.outbox.append(events);
    });
  }
}
