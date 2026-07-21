import type { AutomationAttemptDto } from '../../dto/automation/automation-attempt.dto.js';
import type { AutomationAttempt } from '../../../domain/automation/automation-attempt.js';

export const AutomationAttemptMapper = {
  toDto(attempt: AutomationAttempt): AutomationAttemptDto {
    const props = attempt.toProps();
    return {
      attemptNumber: props.attemptNumber,
      completedAt: props.completedAt?.toISOString(),
      createdAt: props.createdAt.toISOString(),
      errorCode: props.errorCode,
      errorMessage: props.errorMessage,
      executionId: props.executionId,
      id: props.id,
      metadataJson: props.metadataJson,
      providerExecutionId: props.providerExecutionId,
      responseCode: props.responseCode,
      startedAt: props.startedAt.toISOString(),
      status: props.status,
    };
  },
};
