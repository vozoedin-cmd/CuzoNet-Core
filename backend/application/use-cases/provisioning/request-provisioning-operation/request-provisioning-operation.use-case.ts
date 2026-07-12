import type {
  OperationAcceptedDto,
  RequestProvisioningOperationInput,
} from '../../../dto/provisioning/provisioning-operation.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { ActorContext } from '../../../ports/provisioning/actor-context.port.js';
import type { OutboxPort } from '../../../ports/provisioning/outbox.port.js';
import type { ProvisioningIdempotencyPort } from '../../../ports/provisioning/provisioning-idempotency.port.js';
import type { ProvisioningOperationRepository } from '../../../ports/provisioning/provisioning-operation-repository.port.js';
import type { ProvisioningUnitOfWork } from '../../../ports/provisioning/provisioning-unit-of-work.port.js';
import type { RetryPolicy } from '../../../ports/provisioning/retry-policy.port.js';
import type { ServiceProvisioningReader } from '../../../ports/provisioning/service-provisioning-reader.port.js';
import { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';
import { ProvisioningOperationConflictError } from '../../../../domain/provisioning/errors/provisioning-operation-conflict.error.js';
import { ProvisioningStateConflictError } from '../../../../domain/provisioning/errors/provisioning-state-conflict.error.js';
import { OperationId } from '../../../../domain/provisioning/value-objects/operation-id.js';
import { OperationType } from '../../../../domain/provisioning/value-objects/operation-type.js';
import { ProvisionRequest } from '../../../../domain/provisioning/value-objects/provision-request.js';
import { ServiceNotFoundError } from '../../../../domain/services/errors/service-not-found.error.js';

export class RequestProvisioningOperation {
  public constructor(
    private readonly repository: ProvisioningOperationRepository,
    private readonly idempotency: ProvisioningIdempotencyPort,
    private readonly serviceReader: ServiceProvisioningReader,
    private readonly outbox: OutboxPort,
    private readonly unitOfWork: ProvisioningUnitOfWork,
    private readonly companyContext: CompanyContext,
    private readonly actorContext: ActorContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly retryPolicy: RetryPolicy,
  ) {}

  public async execute(input: RequestProvisioningOperationInput): Promise<OperationAcceptedDto> {
    const companyId = this.companyContext.getCompanyId();
    const existing = await this.idempotency.findByIdempotencyKey(
      companyId,
      input.serviceId,
      input.idempotencyKey,
    );
    if (existing !== null) {
      return {
        correlationId: existing.correlationId,
        operationId: existing.id.value,
        status: 'queued',
      };
    }

    const service = await this.serviceReader.findById(companyId, input.serviceId);
    if (service === null) throw new ServiceNotFoundError();
    if (service.lifecycleStatus !== 'pending') {
      throw new ProvisioningStateConflictError(
        'El servicio debe estar pending para aprovisionarse.',
      );
    }

    const type = OperationType.create(input.type);
    if (await this.repository.hasNonTerminal(companyId, input.serviceId, type.value)) {
      throw new ProvisioningOperationConflictError();
    }

    const now = this.clock.now();
    const operation = ProvisioningOperation.create({
      causationId: input.causationId,
      companyId,
      correlationId: input.correlationId,
      createdAt: now,
      eventId: this.idGenerator.generate(),
      id: OperationId.create(this.idGenerator.generate()),
      idempotencyKey: input.idempotencyKey,
      maxAttempts: this.retryPolicy.getMaxAttempts(),
      provisionRequest: ProvisionRequest.create({
        routerId: input.routerId,
        ...(input.ipAddressId === undefined ? {} : { ipAddressId: input.ipAddressId }),
        ...(input.serviceAddressId === undefined
          ? {}
          : { serviceAddressId: input.serviceAddressId }),
      }),
      requestedBy: this.actorContext.getActorId(),
      serviceId: input.serviceId,
      type,
    });
    const events = operation.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.repository.save(operation);
      await this.outbox.append(events);
    });

    return {
      correlationId: input.correlationId,
      operationId: operation.id.value,
      status: 'queued',
    };
  }
}
