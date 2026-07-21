export type AutomationExecutionStatus =
  | 'pending'
  | 'processing'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface AutomationExecutionProps {
  actionSnapshotJson: string;
  actionType: string;
  attemptCount: number;
  cancelledAt: Date | undefined;
  companyId: string;
  completedAt: Date | undefined;
  createdAt: Date;
  eventId: string;
  eventSnapshotJson: string;
  eventType: string;
  id: string;
  lastErrorCode: string | undefined;
  lastErrorMessage: string | undefined;
  maxAttempts: number;
  nextAttemptAt: Date | undefined;
  processingLeaseUntil: Date | undefined;
  processingStartedAt: Date | undefined;
  processingWorkerId: string | undefined;
  providerExecutionId: string | undefined;
  ruleId: string;
  startedAt: Date | undefined;
  status: AutomationExecutionStatus;
  updatedAt: Date;
}

export class AutomationExecution {
  private constructor(private readonly props: AutomationExecutionProps) {}

  public static rehydrate(props: AutomationExecutionProps): AutomationExecution {
    return new AutomationExecution(props);
  }

  public static create(
    props: Omit<
      AutomationExecutionProps,
      | 'attemptCount'
      | 'cancelledAt'
      | 'completedAt'
      | 'createdAt'
      | 'lastErrorCode'
      | 'lastErrorMessage'
      | 'processingLeaseUntil'
      | 'processingStartedAt'
      | 'processingWorkerId'
      | 'providerExecutionId'
      | 'startedAt'
      | 'status'
      | 'updatedAt'
    >,
  ): AutomationExecution {
    return new AutomationExecution({
      ...props,
      attemptCount: 0,
      cancelledAt: undefined,
      completedAt: undefined,
      createdAt: new Date(),
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      processingLeaseUntil: undefined,
      processingStartedAt: undefined,
      processingWorkerId: undefined,
      providerExecutionId: undefined,
      startedAt: undefined,
      status: 'pending',
      updatedAt: new Date(),
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get ruleId(): string {
    return this.props.ruleId;
  }
  public get eventId(): string {
    return this.props.eventId;
  }
  public get eventType(): string {
    return this.props.eventType;
  }
  public get actionType(): string {
    return this.props.actionType;
  }
  public get actionSnapshotJson(): string {
    return this.props.actionSnapshotJson;
  }
  public get eventSnapshotJson(): string {
    return this.props.eventSnapshotJson;
  }
  public get status(): AutomationExecutionStatus {
    return this.props.status;
  }
  public get attemptCount(): number {
    return this.props.attemptCount;
  }
  public get maxAttempts(): number {
    return this.props.maxAttempts;
  }
  public get nextAttemptAt(): Date | undefined {
    return this.props.nextAttemptAt;
  }

  public claim(workerId: string, now: Date, leaseUntil: Date): void {
    if (this.props.status !== 'pending' && this.props.status !== 'retrying' && this.props.status !== 'processing') {
      throw new Error(`Cannot claim execution in state ${this.props.status}`);
    }
    if (
      this.props.status === 'processing' &&
      this.props.processingLeaseUntil &&
      this.props.processingLeaseUntil > now
    ) {
      if (this.props.processingWorkerId !== workerId) {
        throw new Error('Execution is locked by another worker.');
      }
    }
    this.props.status = 'processing';
    this.props.processingStartedAt = now;
    this.props.processingWorkerId = workerId;
    this.props.processingLeaseUntil = leaseUntil;
    this.props.updatedAt = now;
    if (!this.props.startedAt) this.props.startedAt = now;
  }

  public succeed(providerExecutionId: string | undefined, now: Date): void {
    this.assertProcessing();
    this.props.status = 'succeeded';
    this.props.providerExecutionId = providerExecutionId;
    this.props.completedAt = now;
    this.props.updatedAt = now;
    this.clearLease();
  }

  public retry(
    errorCode: string,
    errorMessage: string,
    nextAttemptAt: Date | undefined,
    now: Date,
  ): void {
    this.assertProcessing();
    this.props.attemptCount += 1;
    this.props.lastErrorCode = errorCode;
    this.props.lastErrorMessage = errorMessage;
    if (this.props.attemptCount >= this.props.maxAttempts) {
      this.fail(errorCode, errorMessage, now);
      return;
    }
    this.props.status = 'retrying';
    this.props.nextAttemptAt = nextAttemptAt;
    this.props.updatedAt = now;
    this.clearLease();
  }

  public fail(errorCode: string, errorMessage: string, now: Date): void {
    this.assertProcessing();
    this.props.attemptCount = Math.max(this.props.attemptCount, 1);
    this.props.status = 'failed';
    this.props.lastErrorCode = errorCode;
    this.props.lastErrorMessage = errorMessage;
    this.props.completedAt = now;
    this.props.updatedAt = now;
    this.clearLease();
  }

  public cancel(now: Date): void {
    if (this.props.status === 'succeeded' || this.props.status === 'failed' || this.props.status === 'cancelled') {
      throw new Error(`Cannot cancel execution in state ${this.props.status}`);
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = now;
    this.props.completedAt = now;
    this.props.updatedAt = now;
    this.clearLease();
  }

  private assertProcessing(): void {
    if (this.props.status !== 'processing') {
      throw new Error(`Execution must be in processing state, but is ${this.props.status}`);
    }
  }

  private clearLease(): void {
    this.props.processingWorkerId = undefined;
    this.props.processingStartedAt = undefined;
    this.props.processingLeaseUntil = undefined;
  }

  public toProps(): AutomationExecutionProps {
    return { ...this.props };
  }
}
