import type { AutomationAttemptStatus } from '../../../domain/automation/automation-attempt.js';

export interface AutomationAttemptDto {
  attemptNumber: number;
  completedAt?: string | undefined;
  createdAt: string;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  executionId: string;
  id: string;
  metadataJson: string;
  providerExecutionId?: string | undefined;
  responseCode?: number | undefined;
  startedAt: string;
  status: AutomationAttemptStatus;
}
