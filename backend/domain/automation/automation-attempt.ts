export type AutomationAttemptStatus = 'started' | 'succeeded' | 'failed';

export interface AutomationAttemptProps {
  id: string;
  executionId: string;
  attemptNumber: number;
  status: AutomationAttemptStatus;
  startedAt: Date;
  completedAt: Date | undefined;
  responseCode: number | undefined;
  errorCode: string | undefined;
  errorMessage: string | undefined;
  providerExecutionId: string | undefined;
  metadataJson: string;
  createdAt: Date;
}

export class AutomationAttempt {
  private constructor(private readonly props: AutomationAttemptProps) {}

  public static rehydrate(props: AutomationAttemptProps): AutomationAttempt {
    return new AutomationAttempt(props);
  }

  public static create(
    executionId: string,
    attemptNumber: number,
    now: Date,
    id: string,
  ): AutomationAttempt {
    return new AutomationAttempt({
      attemptNumber,
      completedAt: undefined,
      createdAt: now,
      errorCode: undefined,
      errorMessage: undefined,
      executionId,
      id,
      metadataJson: '{}',
      providerExecutionId: undefined,
      responseCode: undefined,
      startedAt: now,
      status: 'started',
    });
  }

  public succeed(
    responseCode: number | undefined,
    providerExecutionId: string | undefined,
    metadataJson: string,
    now: Date,
  ): void {
    if (this.props.status !== 'started') throw new Error('Attempt already finished');
    this.props.status = 'succeeded';
    this.props.responseCode = responseCode;
    this.props.providerExecutionId = providerExecutionId;
    this.props.metadataJson = metadataJson;
    this.props.completedAt = now;
  }

  public fail(
    responseCode: number | undefined,
    errorCode: string,
    errorMessage: string,
    now: Date,
  ): void {
    if (this.props.status !== 'started') throw new Error('Attempt already finished');
    this.props.status = 'failed';
    this.props.responseCode = responseCode;
    this.props.errorCode = errorCode;
    this.props.errorMessage = errorMessage;
    this.props.completedAt = now;
  }

  public toProps(): AutomationAttemptProps {
    return { ...this.props };
  }
}
