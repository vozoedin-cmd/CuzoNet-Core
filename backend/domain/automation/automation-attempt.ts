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

import type { AutomationAttemptDto } from '../../application/dto/automation/automation-attempt.dto.js';

export class AutomationAttempt {
  private constructor(private readonly props: AutomationAttemptProps) {}

  public static rehydrate(props: AutomationAttemptProps): AutomationAttempt {
    return new AutomationAttempt(props);
  }

  public static fromDto(dto: AutomationAttemptDto): AutomationAttempt {
    return new AutomationAttempt({
      attemptNumber: dto.attemptNumber,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      createdAt: new Date(dto.createdAt),
      errorCode: dto.errorCode,
      errorMessage: dto.errorMessage,
      executionId: dto.executionId,
      id: dto.id,
      metadataJson: dto.metadataJson,
      providerExecutionId: dto.providerExecutionId,
      responseCode: dto.responseCode,
      startedAt: new Date(dto.startedAt),
      status: dto.status,
    });
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

  public toDto(): AutomationAttemptDto {
    return {
      attemptNumber: this.props.attemptNumber,
      completedAt: this.props.completedAt?.toISOString(),
      createdAt: this.props.createdAt.toISOString(),
      errorCode: this.props.errorCode,
      errorMessage: this.props.errorMessage,
      executionId: this.props.executionId,
      id: this.props.id,
      metadataJson: this.props.metadataJson,
      providerExecutionId: this.props.providerExecutionId,
      responseCode: this.props.responseCode,
      startedAt: this.props.startedAt.toISOString(),
      status: this.props.status,
    };
  }
}
