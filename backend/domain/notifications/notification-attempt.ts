import type { JsonValue, NotificationAttemptStatus } from './types.js';

export interface NotificationAttemptProps {
  attemptNumber: number;
  completedAt?: Date;
  createdAt: Date;
  errorCode?: string;
  errorMessage?: string;
  id: string;
  metadata?: Readonly<Record<string, JsonValue>>;
  notificationId: string;
  responseCode?: number;
  retryAt?: Date;
  startedAt: Date;
  status: NotificationAttemptStatus;
}

export class NotificationAttempt {
  private constructor(public readonly props: NotificationAttemptProps) {}

  public static start(props: {
    attemptNumber: number;
    id: string;
    notificationId: string;
    startedAt: Date;
  }): NotificationAttempt {
    if (!Number.isInteger(props.attemptNumber) || props.attemptNumber < 1)
      throw new RangeError('attemptNumber debe ser un entero mayor que cero.');
    return new NotificationAttempt({
      ...props,
      createdAt: props.startedAt,
      status: 'processing',
    });
  }

  public static reconstitute(props: NotificationAttemptProps): NotificationAttempt {
    return new NotificationAttempt({ ...props });
  }

  public complete(props: {
    completedAt: Date;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Readonly<Record<string, JsonValue>>;
    responseCode?: number;
    retryAt?: Date;
    status: Exclude<NotificationAttemptStatus, 'processing'>;
  }): void {
    if (this.props.status !== 'processing') throw new Error('El intento ya fue completado.');
    this.props.status = props.status;
    this.props.completedAt = props.completedAt;
    if (props.errorCode !== undefined) this.props.errorCode = props.errorCode.slice(0, 100);
    if (props.errorMessage !== undefined)
      this.props.errorMessage = props.errorMessage.replace(/[\r\n\t]+/g, ' ').slice(0, 1_000);
    if (props.metadata !== undefined) this.props.metadata = props.metadata;
    if (props.responseCode !== undefined) this.props.responseCode = props.responseCode;
    if (props.retryAt !== undefined) this.props.retryAt = props.retryAt;
  }
}
