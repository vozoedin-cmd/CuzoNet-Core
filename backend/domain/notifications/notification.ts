import { NotificationStateConflictError } from './notification-errors.js';
import type {
  IncidentNotificationEvent,
  NotificationChannelType,
  NotificationEventType,
  NotificationPriority,
  NotificationStatus,
} from './types.js';

export interface NotificationProps {
  attempts: number;
  channel: NotificationChannelType;
  companyId: string;
  createdAt: Date;
  destinationId: string;
  failedAt?: Date;
  id: string;
  idempotencyKey: string;
  incidentId: string;
  lastError?: string;
  lastFailureRetryable?: boolean;
  maxAttempts: number;
  payload: IncidentNotificationEvent;
  priority: NotificationPriority;
  processingLeaseUntil?: Date;
  processingStartedAt?: Date;
  processingWorkerId?: string;
  scheduledAt: Date;
  sentAt?: Date;
  sourceEventId: string;
  sourceEventType: NotificationEventType;
  status: NotificationStatus;
  templateCode: string;
  updatedAt: Date;
}

export interface CreateNotificationProps {
  channel: NotificationChannelType;
  companyId: string;
  createdAt: Date;
  destinationId: string;
  id: string;
  incidentId: string;
  maxAttempts: number;
  payload: IncidentNotificationEvent;
  priority: NotificationPriority;
  scheduledAt: Date;
  sourceEventId: string;
  sourceEventType: NotificationEventType;
  templateCode: string;
}

export class Notification {
  private constructor(public readonly props: NotificationProps) {}

  public static create(props: CreateNotificationProps): Notification {
    for (const [field, value] of Object.entries({
      companyId: props.companyId,
      destinationId: props.destinationId,
      id: props.id,
      incidentId: props.incidentId,
      sourceEventId: props.sourceEventId,
      templateCode: props.templateCode,
    })) {
      if (value.trim().length === 0) throw new TypeError(`${field} es requerido.`);
    }
    if (!Number.isInteger(props.maxAttempts) || props.maxAttempts < 1)
      throw new RangeError('maxAttempts debe ser un entero mayor que cero.');
    if (props.payload.companyId !== props.companyId)
      throw new TypeError('El payload y la notificación deben pertenecer a la misma compañía.');
    if (props.payload.eventId !== props.sourceEventId)
      throw new TypeError('El payload debe corresponder al evento fuente.');

    return new Notification({
      ...props,
      attempts: 0,
      idempotencyKey: Notification.idempotencyKeyFor(props),
      status: 'pending',
      updatedAt: props.createdAt,
    });
  }

  public static reconstitute(props: NotificationProps): Notification {
    return new Notification({ ...props });
  }

  public static idempotencyKeyFor(
    props: Pick<
      CreateNotificationProps,
      'channel' | 'companyId' | 'destinationId' | 'sourceEventId'
    >,
  ): string {
    return [props.companyId, props.sourceEventId, props.channel, props.destinationId].join(':');
  }

  public claim(at: Date, workerId: string, leaseUntil: Date): void {
    const canClaim =
      this.props.status === 'pending' ||
      this.props.status === 'retrying' ||
      (this.props.status === 'processing' && this.isLeaseExpired(at));
    if (!canClaim) throw new NotificationStateConflictError('La notificación no puede reclamarse.');
    if (this.props.scheduledAt > at)
      throw new NotificationStateConflictError(
        'La notificación aún no está programada para envío.',
      );
    if (workerId.trim().length === 0 || leaseUntil <= at)
      throw new TypeError('El lease de procesamiento no es válido.');
    this.props.status = 'processing';
    this.props.processingStartedAt = at;
    this.props.processingWorkerId = workerId;
    this.props.processingLeaseUntil = leaseUntil;
    this.props.updatedAt = at;
  }

  public beginAttempt(at: Date, workerId: string): number {
    this.assertProcessingBy(workerId);
    if (this.props.attempts >= this.props.maxAttempts)
      throw new NotificationStateConflictError('La notificación agotó sus intentos.');
    this.props.attempts += 1;
    this.props.updatedAt = at;
    return this.props.attempts;
  }

  public markSent(at: Date, workerId: string): void {
    this.assertProcessingBy(workerId);
    this.props.status = 'sent';
    this.props.sentAt = at;
    delete this.props.failedAt;
    delete this.props.lastError;
    delete this.props.lastFailureRetryable;
    this.clearProcessingLease();
    this.props.updatedAt = at;
  }

  public markRetrying(error: string, retryAt: Date, at: Date, workerId: string): void {
    this.assertProcessingBy(workerId);
    if (this.props.attempts >= this.props.maxAttempts)
      throw new NotificationStateConflictError('La notificación agotó sus intentos.');
    this.props.status = 'retrying';
    this.props.scheduledAt = retryAt;
    this.props.lastError = sanitizeError(error);
    this.props.lastFailureRetryable = true;
    delete this.props.failedAt;
    this.clearProcessingLease();
    this.props.updatedAt = at;
  }

  public markFailed(error: string, retryable: boolean, at: Date, workerId: string): void {
    this.assertProcessingBy(workerId);
    this.props.status = 'failed';
    this.props.failedAt = at;
    this.props.lastError = sanitizeError(error);
    this.props.lastFailureRetryable = retryable;
    this.clearProcessingLease();
    this.props.updatedAt = at;
  }

  public cancel(reason: string | undefined, at: Date): void {
    if (this.props.status === 'sent' || this.props.status === 'cancelled')
      throw new NotificationStateConflictError('La notificación ya no puede cancelarse.');
    if (this.props.status === 'processing')
      throw new NotificationStateConflictError(
        'No puede cancelarse una notificación en procesamiento.',
      );
    this.props.status = 'cancelled';
    this.props.lastError =
      reason === undefined ? 'Cancelada administrativamente.' : sanitizeError(reason);
    this.clearProcessingLease();
    this.props.updatedAt = at;
  }

  public scheduleManualRetry(at: Date): void {
    if (this.props.status !== 'failed' && this.props.status !== 'retrying')
      throw new NotificationStateConflictError('Sólo una notificación fallida puede reintentarse.');
    if (this.props.lastFailureRetryable === false)
      throw new NotificationStateConflictError('Los errores permanentes no pueden reintentarse.');
    if (this.props.attempts >= this.props.maxAttempts)
      throw new NotificationStateConflictError('La notificación agotó sus intentos.');
    this.props.status = 'retrying';
    this.props.scheduledAt = at;
    delete this.props.failedAt;
    this.props.updatedAt = at;
  }

  public isLeaseExpired(at: Date): boolean {
    return this.props.processingLeaseUntil !== undefined && this.props.processingLeaseUntil <= at;
  }

  private assertProcessingBy(workerId: string): void {
    if (this.props.status !== 'processing' || this.props.processingWorkerId !== workerId)
      throw new NotificationStateConflictError('La notificación no pertenece a este worker.');
  }

  private clearProcessingLease(): void {
    delete this.props.processingLeaseUntil;
    delete this.props.processingStartedAt;
    delete this.props.processingWorkerId;
  }
}

export function sanitizeError(error: string): string {
  return (
    error
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 1_000) || 'UnknownError'
  );
}
