import type { AutomationExecutionStatus } from '../../../domain/automation/automation-execution.js';

export interface AutomationExecutionDto {
  actionSnapshotJson: string;
  actionType: string;
  attemptCount: number;
  cancelledAt?: string | undefined;
  companyId: string;
  completedAt?: string | undefined;
  createdAt: string;
  eventId: string;
  eventSnapshotJson: string;
  eventType: string;
  id: string;
  lastErrorCode?: string | undefined;
  lastErrorMessage?: string | undefined;
  maxAttempts: number;
  nextAttemptAt?: string | undefined;
  processingLeaseUntil?: string | undefined;
  processingStartedAt?: string | undefined;
  processingWorkerId?: string | undefined;
  providerExecutionId?: string | undefined;
  ruleId: string;
  startedAt?: string | undefined;
  status: AutomationExecutionStatus;
  updatedAt: string;
}
