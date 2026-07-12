import { NetworkOperationFailedEvent } from './events/network-operation-failed.event.js';
import { ProvisioningOperationQueuedEvent } from './events/provisioning-operation-queued.event.js';
import { InvalidProvisioningDataError } from './errors/invalid-provisioning-data.error.js';
import { ProvisioningStateConflictError } from './errors/provisioning-state-conflict.error.js';
import type { OperationFailure } from './value-objects/operation-failure.js';
import type { OperationId } from './value-objects/operation-id.js';
import { OperationStatus } from './value-objects/operation-status.js';
import type { OperationType } from './value-objects/operation-type.js';
import type { ProvisionRequest } from './value-objects/provision-request.js';

export type ProvisioningDomainEvent =
  NetworkOperationFailedEvent | ProvisioningOperationQueuedEvent;

export interface ProvisioningOperationHydrationProps {
  attemptCount: number;
  causationId: string;
  companyId: string;
  completedAt: Date | undefined;
  correlationId: string;
  createdAt: Date;
  id: OperationId;
  idempotencyKey: string;
  lastErrorCode: string | undefined;
  lastErrorMessage: string | undefined;
  maxAttempts: number;
  nextAttemptAt: Date | undefined;
  provisionRequest: ProvisionRequest;
  requestedBy: string;
  serviceId: string;
  startedAt: Date | undefined;
  status: OperationStatus;
  type: OperationType;
}

export interface CreateProvisioningOperationProps extends Omit<
  ProvisioningOperationHydrationProps,
  | 'attemptCount'
  | 'completedAt'
  | 'lastErrorCode'
  | 'lastErrorMessage'
  | 'nextAttemptAt'
  | 'startedAt'
  | 'status'
> {
  eventId: string;
}

export interface FailProvisioningOperationProps {
  eventId: string;
  failure: OperationFailure;
  occurredAt: Date;
}

export class ProvisioningOperation {
  private readonly domainEvents: ProvisioningDomainEvent[] = [];

  private constructor(private readonly props: ProvisioningOperationHydrationProps) {
    if (!Number.isInteger(props.maxAttempts) || props.maxAttempts < 1) {
      throw new InvalidProvisioningDataError('maxAttempts', 'Debe ser un entero mayor que cero.');
    }
    if (
      !Number.isInteger(props.attemptCount) ||
      props.attemptCount < 0 ||
      props.attemptCount > props.maxAttempts
    ) {
      throw new InvalidProvisioningDataError('attemptCount', 'Cantidad de intentos no permitida.');
    }
  }

  public static create(props: CreateProvisioningOperationProps): ProvisioningOperation {
    const operation = new ProvisioningOperation({
      ...props,
      attemptCount: 0,
      completedAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      nextAttemptAt: undefined,
      startedAt: undefined,
      status: OperationStatus.queued(),
    });
    operation.domainEvents.push(
      new ProvisioningOperationQueuedEvent({
        aggregateId: props.id.value,
        causationId: props.causationId,
        companyId: props.companyId,
        correlationId: props.correlationId,
        eventId: props.eventId,
        occurredAt: props.createdAt,
        serviceId: props.serviceId,
      }),
    );
    return operation;
  }

  public static rehydrate(props: ProvisioningOperationHydrationProps): ProvisioningOperation {
    return new ProvisioningOperation(props);
  }

  public start(at: Date): void {
    this.assertStatus('queued');
    if (this.props.nextAttemptAt !== undefined && this.props.nextAttemptAt > at) {
      throw new ProvisioningStateConflictError(
        'La operación aún no está disponible para ejecución.',
      );
    }
    if (this.props.attemptCount >= this.props.maxAttempts) {
      throw new ProvisioningStateConflictError('La operación agotó sus intentos.');
    }
    this.props.attemptCount += 1;
    this.props.startedAt = at;
    this.props.nextAttemptAt = undefined;
    this.props.status = OperationStatus.create('running');
  }

  public complete(at: Date): void {
    this.assertStatus('running');
    this.props.completedAt = at;
    this.props.lastErrorCode = undefined;
    this.props.lastErrorMessage = undefined;
    this.props.status = OperationStatus.create('succeeded');
  }

  public fail(props: FailProvisioningOperationProps): void {
    this.assertStatus('running');
    this.props.lastErrorCode = props.failure.code;
    this.props.lastErrorMessage = props.failure.message;
    this.props.status = OperationStatus.create('failed');
    this.domainEvents.push(
      new NetworkOperationFailedEvent({
        aggregateId: this.id.value,
        attemptCount: this.attemptCount,
        causationId: this.props.causationId,
        companyId: this.companyId,
        correlationId: this.correlationId,
        errorCode: props.failure.code,
        eventId: props.eventId,
        occurredAt: props.occurredAt,
        serviceId: this.serviceId,
      }),
    );
  }

  public retry(nextAttemptAt: Date): void {
    this.assertStatus('failed');
    if (this.props.attemptCount >= this.props.maxAttempts) {
      this.props.status = OperationStatus.create('manual_review');
      this.props.nextAttemptAt = undefined;
      return;
    }
    this.props.nextAttemptAt = nextAttemptAt;
    this.props.status = OperationStatus.queued();
  }

  public requireManualReview(): void {
    this.assertStatus('failed');
    this.props.nextAttemptAt = undefined;
    this.props.status = OperationStatus.create('manual_review');
  }

  public cancel(): void {
    if (this.status.value !== 'queued' && this.status.value !== 'failed') {
      throw new ProvisioningStateConflictError(
        'La operación no puede cancelarse en su estado actual.',
      );
    }
    this.props.nextAttemptAt = undefined;
    this.props.status = OperationStatus.create('cancelled');
  }

  public pullDomainEvents(): readonly ProvisioningDomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private assertStatus(expected: string): void {
    if (this.status.value !== expected) {
      throw new ProvisioningStateConflictError(`La operación debe estar en estado ${expected}.`);
    }
  }

  public get id(): OperationId {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get serviceId(): string {
    return this.props.serviceId;
  }
  public get type(): OperationType {
    return this.props.type;
  }
  public get status(): OperationStatus {
    return this.props.status;
  }
  public get provisionRequest(): ProvisionRequest {
    return this.props.provisionRequest;
  }
  public get requestedBy(): string {
    return this.props.requestedBy;
  }
  public get correlationId(): string {
    return this.props.correlationId;
  }
  public get causationId(): string {
    return this.props.causationId;
  }
  public get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  public get attemptCount(): number {
    return this.props.attemptCount;
  }
  public get maxAttempts(): number {
    return this.props.maxAttempts;
  }
  public get lastErrorCode(): string | undefined {
    return this.props.lastErrorCode;
  }
  public get lastErrorMessage(): string | undefined {
    return this.props.lastErrorMessage;
  }
  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
  public get startedAt(): Date | undefined {
    return this.props.startedAt === undefined ? undefined : new Date(this.props.startedAt);
  }
  public get completedAt(): Date | undefined {
    return this.props.completedAt === undefined ? undefined : new Date(this.props.completedAt);
  }
  public get nextAttemptAt(): Date | undefined {
    return this.props.nextAttemptAt === undefined ? undefined : new Date(this.props.nextAttemptAt);
  }
}
