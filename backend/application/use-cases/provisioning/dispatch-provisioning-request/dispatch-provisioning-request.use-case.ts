import type { ProvisioningActionAdapter } from '../../../ports/provisioning/provisioning-action-adapter.port.js';
import type { ProvisioningAttemptRepository } from '../../../ports/provisioning/provisioning-attempt-repository.port.js';
import type { OutboxPort } from '../../../ports/provisioning/outbox.port.js';
import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import { ProvisioningAttempt } from '../../../../domain/provisioning/provisioning-attempt.js';
import type { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';
import type { ProvisioningRetryPolicy } from '../../../../domain/provisioning/services/provisioning-retry-policy.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { ProvisioningEventPayload } from '../../../../domain/provisioning/events/provisioning-event-payload.js';
import type { ProvisioningRequestDomainEvent } from '../../../../domain/provisioning/events/provisioning-request-domain-event.js';
import { ProvisioningFailedEvent } from '../../../../domain/provisioning/events/provisioning-failed.event.js';
import { ProvisioningRetryScheduledEvent } from '../../../../domain/provisioning/events/provisioning-retry-scheduled.event.js';
import { ProvisioningSucceededEvent } from '../../../../domain/provisioning/events/provisioning-succeeded.event.js';
import {
  extractRouterId,
  splitActionType,
} from '../shared/provisioning-event-parsing.util.js';
import {
  noOpProvisioningEventLogger,
  publishProvisioningEvents,
  type ProvisioningEventLogger,
} from '../shared/publish-provisioning-events.js';

export interface DispatchProvisioningRequestInput {
  requestId: string;
  workerId: string;
}

export class DispatchProvisioningRequest {
  public constructor(
    private readonly requestRepository: ProvisioningRequestRepository,
    private readonly attemptRepository: ProvisioningAttemptRepository,
    private readonly adapters: ReadonlyMap<string, ProvisioningActionAdapter>,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly retryPolicy: ProvisioningRetryPolicy,
    private readonly outbox: OutboxPort<ProvisioningRequestDomainEvent>,
    private readonly eventLogger: ProvisioningEventLogger = noOpProvisioningEventLogger,
  ) {}

  public async execute(input: DispatchProvisioningRequestInput): Promise<void> {
    const request = await this.requestRepository.findById(input.requestId);
    if (!request) {
      return;
    }

    if (request.status !== 'processing' || request.processingWorkerId !== input.workerId) {
      // No poseemos el lease o no está en procesamiento
      return;
    }

    const adapter = this.adapters.get(request.actionType);
    const at = this.clock.now();

    const attempt = ProvisioningAttempt.create({
      attemptNumber: request.attemptCount + 1,
      id: this.idGenerator.generate(),
      requestId: request.id,
      startedAt: at,
      workerId: input.workerId,
    });

    await this.attemptRepository.save(attempt);

    if (!adapter) {
      const finishedAt = this.clock.now();
      attempt.completePermanentFailure('PROVISIONING_ADAPTER_NOT_FOUND', `Adaptador no encontrado para: ${request.actionType}`, finishedAt);
      request.failPermanently('PROVISIONING_ADAPTER_NOT_FOUND', `Adaptador no encontrado para: ${request.actionType}`, finishedAt);
      await this.saveTransactionally(request, attempt);
      await publishProvisioningEvents(
        this.outbox,
        [this.buildFailedEvent(request, attempt, finishedAt, 'PROVISIONING_ADAPTER_NOT_FOUND', 'permanent')],
        this.eventLogger,
      );
      return;
    }

    try {
      const result = await adapter.execute({
        actionType: request.actionType,
        attemptNumber: attempt.attemptNumber,
        companyId: request.companyId,
        configurationReference: request.configurationReference,
        idempotencyKey: request.idempotencyKey,
        inputSnapshotJson: request.inputSnapshotJson,
        requestId: request.id,
        target: { id: request.targetId, type: request.targetType },
      });

      const finishedAt = this.clock.now();
      const policyResult = this.retryPolicy.calculateNextAttempt(
        request.attemptCount + 1,
        result.outcome,
        'errorCode' in result ? result.errorCode : undefined,
        'retryAfterMs' in result ? result.retryAfterMs : undefined,
        finishedAt,
      );

      const events: ProvisioningRequestDomainEvent[] = [];

      if (result.outcome === 'success') {
        attempt.completeSuccess(finishedAt, result.metadata);
        request.complete(finishedAt);
        events.push(this.buildSucceededEvent(request, attempt, finishedAt));
      } else if (result.outcome === 'permanentFailure' || policyResult.terminal) {
        attempt.completePermanentFailure(result.errorCode, result.errorMessage, finishedAt);
        request.failPermanently(result.errorCode, result.errorMessage, finishedAt);
        events.push(this.buildFailedEvent(request, attempt, finishedAt, result.errorCode, 'permanent'));
      } else {
        attempt.completeTemporaryFailure(result.errorCode, result.errorMessage, finishedAt);
        request.failTemporarily(result.errorCode, result.errorMessage, policyResult.nextAttemptAt!, finishedAt);
        events.push(this.buildFailedEvent(request, attempt, finishedAt, result.errorCode, 'temporary'));
        events.push(this.buildRetryScheduledEvent(request, attempt, finishedAt));
      }

      await this.saveTransactionally(request, attempt);
      await publishProvisioningEvents(this.outbox, events, this.eventLogger);
    } catch (error: unknown) {
      const finishedAt = this.clock.now();
      const errorMessage = (error as Error).message ?? 'Error inesperado.';
      const errorCode = 'UNEXPECTED_PROVISIONING_ERROR';

      const policyResult = this.retryPolicy.calculateNextAttempt(
        request.attemptCount + 1,
        'temporaryFailure',
        errorCode,
        undefined,
        finishedAt,
      );

      const events: ProvisioningRequestDomainEvent[] = [];

      if (policyResult.terminal) {
        attempt.completePermanentFailure(errorCode, errorMessage, finishedAt);
        request.failPermanently(errorCode, errorMessage, finishedAt);
        events.push(this.buildFailedEvent(request, attempt, finishedAt, errorCode, 'permanent'));
      } else {
        attempt.completeTemporaryFailure(errorCode, errorMessage, finishedAt);
        request.failTemporarily(errorCode, errorMessage, policyResult.nextAttemptAt!, finishedAt);
        events.push(this.buildFailedEvent(request, attempt, finishedAt, errorCode, 'temporary'));
        events.push(this.buildRetryScheduledEvent(request, attempt, finishedAt));
      }

      await this.saveTransactionally(request, attempt);
      await publishProvisioningEvents(this.outbox, events, this.eventLogger);
    }
  }

  private async saveTransactionally(request: ProvisioningRequest, attempt: ProvisioningAttempt): Promise<void> {
    // Si tuviéramos un UnitOfWork inyectado lo usaríamos aquí.
    // Por ahora, como es SQL o InMemory, guardar en orden es el estándar en estos adaptadores sin UoW.
    await this.requestRepository.save(request);
    await this.attemptRepository.save(attempt);
  }

  private buildBasePayload(
    request: ProvisioningRequest,
    attempt: ProvisioningAttempt,
    occurredAt: Date,
  ): ProvisioningEventPayload {
    const { action, resourceType } = splitActionType(request.actionType);
    const routerId = extractRouterId(request.inputSnapshotJson);
    return {
      action,
      actionType: request.actionType,
      attemptNumber: attempt.attemptNumber,
      companyId: request.companyId,
      occurredAt: occurredAt.toISOString(),
      requestId: request.id,
      resourceType,
      ...(routerId !== undefined ? { routerId } : {}),
    };
  }

  private buildSucceededEvent(
    request: ProvisioningRequest,
    attempt: ProvisioningAttempt,
    occurredAt: Date,
  ): ProvisioningSucceededEvent {
    return new ProvisioningSucceededEvent({
      aggregateId: request.id,
      causationId: attempt.id,
      correlationId: request.id,
      eventId: this.idGenerator.generate(),
      occurredAt,
      payload: this.buildBasePayload(request, attempt, occurredAt),
    });
  }

  private buildFailedEvent(
    request: ProvisioningRequest,
    attempt: ProvisioningAttempt,
    occurredAt: Date,
    errorCode: string,
    failureType: 'permanent' | 'temporary',
  ): ProvisioningFailedEvent {
    return new ProvisioningFailedEvent({
      aggregateId: request.id,
      causationId: attempt.id,
      correlationId: request.id,
      eventId: this.idGenerator.generate(),
      occurredAt,
      payload: { ...this.buildBasePayload(request, attempt, occurredAt), errorCode, failureType },
    });
  }

  private buildRetryScheduledEvent(
    request: ProvisioningRequest,
    attempt: ProvisioningAttempt,
    occurredAt: Date,
  ): ProvisioningRetryScheduledEvent {
    return new ProvisioningRetryScheduledEvent({
      aggregateId: request.id,
      causationId: attempt.id,
      correlationId: request.id,
      eventId: this.idGenerator.generate(),
      occurredAt,
      payload: this.buildBasePayload(request, attempt, occurredAt),
    });
  }
}
