import type { ProvisioningRequestDto, RequestProvisioningInput } from '../../../dto/provisioning/provisioning-request.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { OutboxPort } from '../../../ports/provisioning/outbox.port.js';
import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';
import { ProvisioningIdempotencyConflictError } from '../../../../domain/provisioning/errors/provisioning-engine.error.js';
import { ProvisioningRequestedEvent } from '../../../../domain/provisioning/events/provisioning-requested.event.js';
import type { ProvisioningEventPayload } from '../../../../domain/provisioning/events/provisioning-event-payload.js';
import type { ProvisioningRequestDomainEvent } from '../../../../domain/provisioning/events/provisioning-request-domain-event.js';
import { ProvisioningRequestMapper } from '../../../mappers/provisioning/provisioning-request.mapper.js';
import {
  extractRouterId,
  splitActionType,
} from '../shared/provisioning-event-parsing.util.js';
import {
  noOpProvisioningEventLogger,
  publishProvisioningEvents,
  type ProvisioningEventLogger,
} from '../shared/publish-provisioning-events.js';

export class RequestProvisioning {
  public constructor(
    private readonly repository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly outbox: OutboxPort<ProvisioningRequestDomainEvent>,
    private readonly clock: Clock,
    private readonly maxAttempts: number = 5,
    private readonly eventLogger: ProvisioningEventLogger = noOpProvisioningEventLogger,
  ) {}

  public async execute(input: RequestProvisioningInput): Promise<ProvisioningRequestDto> {
    const companyId = this.companyContext.getCompanyId();
    const inputHash = ProvisioningRequest.generateInputHash(
      input.actionType,
      input.targetType,
      input.targetId,
      input.configurationReference,
      input.inputSnapshotJson
    );

    const request = ProvisioningRequest.create({
      actionType: input.actionType,
      companyId,
      configurationReference: input.configurationReference,
      id: this.idGenerator.generate(),
      idempotencyKey: input.idempotencyKey,
      inputHash,
      inputSnapshotJson: input.inputSnapshotJson,
      maxAttempts: this.maxAttempts,
      sourceExecutionId: input.sourceExecutionId,
      targetId: input.targetId,
      targetType: input.targetType,
    });

    const result = await this.repository.insertNew(request);

    if (result === 'conflict') {
      const existing = await this.repository.findByIdempotencyKey(companyId, input.idempotencyKey);
      if (!existing) {
        throw new Error('Idempotency key conflict but row not found');
      }

      if (existing.inputHash !== inputHash || existing.sourceExecutionId !== input.sourceExecutionId) {
        throw new ProvisioningIdempotencyConflictError(input.idempotencyKey);
      }
      return ProvisioningRequestMapper.toDto(existing);
    }

    await this.publishRequestedEvent(request);
    return ProvisioningRequestMapper.toDto(request);
  }

  private async publishRequestedEvent(request: ProvisioningRequest): Promise<void> {
    const occurredAt = this.clock.now();
    const { action, resourceType } = splitActionType(request.actionType);
    const routerId = extractRouterId(request.inputSnapshotJson);

    const payload: ProvisioningEventPayload = {
      action,
      actionType: request.actionType,
      attemptNumber: 0,
      companyId: request.companyId,
      occurredAt: occurredAt.toISOString(),
      requestId: request.id,
      resourceType,
      ...(routerId !== undefined ? { routerId } : {}),
    };

    const event = new ProvisioningRequestedEvent({
      aggregateId: request.id,
      causationId: request.id,
      correlationId: request.id,
      eventId: this.idGenerator.generate(),
      occurredAt,
      payload,
    });

    await publishProvisioningEvents(this.outbox, [event], this.eventLogger);
  }
}
