export type ProvisioningAttemptOutcome =
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'retry_scheduled'
  | 'cancelled';

export interface ProvisioningAttemptProps {
  attemptNumber: number;
  durationMs: number | undefined;
  errorCode: string | undefined;
  errorMessage: string | undefined;
  finishedAt: Date | undefined;
  id: string;
  metadataJson: string | undefined;
  outcome: ProvisioningAttemptOutcome;
  requestId: string;
  startedAt: Date;
  workerId: string;
}

export class ProvisioningAttempt {
  private constructor(private readonly props: ProvisioningAttemptProps) {}

  public static rehydrate(props: ProvisioningAttemptProps): ProvisioningAttempt {
    return new ProvisioningAttempt(props);
  }

  public static create(
    props: Omit<
      ProvisioningAttemptProps,
      | 'durationMs'
      | 'errorCode'
      | 'errorMessage'
      | 'finishedAt'
      | 'metadataJson'
      | 'outcome'
    >,
  ): ProvisioningAttempt {
    return new ProvisioningAttempt({
      ...props,
      durationMs: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      finishedAt: undefined,
      metadataJson: undefined,
      outcome: 'processing',
    });
  }

  public get id(): string { return this.props.id; }
  public get requestId(): string { return this.props.requestId; }
  public get attemptNumber(): number { return this.props.attemptNumber; }
  public get workerId(): string { return this.props.workerId; }
  public get startedAt(): Date { return this.props.startedAt; }
  public get finishedAt(): Date | undefined { return this.props.finishedAt; }
  public get outcome(): ProvisioningAttemptOutcome { return this.props.outcome; }
  public get errorCode(): string | undefined { return this.props.errorCode; }
  public get errorMessage(): string | undefined { return this.props.errorMessage; }
  public get durationMs(): number | undefined { return this.props.durationMs; }
  public get metadataJson(): string | undefined { return this.props.metadataJson; }

  public completeSuccess(at: Date, metadata?: Record<string, unknown>): void {
    this.props.outcome = 'succeeded';
    this.props.finishedAt = at;
    this.props.durationMs = at.getTime() - this.props.startedAt.getTime();
    if (metadata) {
      this.props.metadataJson = JSON.stringify(metadata);
    }
  }

  public completeTemporaryFailure(errorCode: string, errorMessage: string, at: Date): void {
    this.props.outcome = 'retry_scheduled';
    this.props.finishedAt = at;
    this.props.durationMs = at.getTime() - this.props.startedAt.getTime();
    this.props.errorCode = errorCode;
    this.props.errorMessage = errorMessage;
  }

  public completePermanentFailure(errorCode: string, errorMessage: string, at: Date): void {
    this.props.outcome = 'failed';
    this.props.finishedAt = at;
    this.props.durationMs = at.getTime() - this.props.startedAt.getTime();
    this.props.errorCode = errorCode;
    this.props.errorMessage = errorMessage;
  }

  public toDto() {
    return {
      attemptNumber: this.props.attemptNumber,
      durationMs: this.props.durationMs,
      errorCode: this.props.errorCode,
      errorMessage: this.props.errorMessage,
      finishedAt: this.props.finishedAt?.toISOString(),
      id: this.props.id,
      metadataJson: this.props.metadataJson,
      outcome: this.props.outcome,
      requestId: this.props.requestId,
      startedAt: this.props.startedAt.toISOString(),
      workerId: this.props.workerId,
    };
  }
}
