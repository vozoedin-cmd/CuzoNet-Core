import type { ProvisioningStatus } from '../../../domain/provisioning/provisioning-request.js';

export interface ProvisioningRequestDto {
  actionType: string;
  attemptCount: number;
  companyId: string;
  completedAt?: string;
  configurationReference?: string;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  inputHash: string;
  inputSnapshotJson: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  maxAttempts: number;
  nextAttemptAt?: string;
  processingStartedAt?: string;
  processingWorkerId?: string;
  sourceExecutionId?: string;
  status: ProvisioningStatus;
  targetId: string;
  targetType: string;
  updatedAt: string;
}

export interface RequestProvisioningInput {
  actionType: string;
  configurationReference?: string;
  idempotencyKey: string;
  inputSnapshotJson: string;
  sourceExecutionId?: string;
  targetId: string;
  targetType: string;
}
