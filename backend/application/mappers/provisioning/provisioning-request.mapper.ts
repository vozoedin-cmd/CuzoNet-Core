import type { ProvisioningRequestDto } from '../../dto/provisioning/provisioning-request.dto.js';
import type { ProvisioningRequest } from '../../../domain/provisioning/provisioning-request.js';

export const ProvisioningRequestMapper = {
  toDto(request: ProvisioningRequest): ProvisioningRequestDto {
    const props = request.toProps();
    const dto: Partial<ProvisioningRequestDto> = {
      actionType: props.actionType,
      attemptCount: props.attemptCount,
      companyId: props.companyId,
      createdAt: props.createdAt.toISOString(),
      id: props.id,
      idempotencyKey: props.idempotencyKey,
      inputHash: props.inputHash,
      inputSnapshotJson: props.inputSnapshotJson,
      maxAttempts: props.maxAttempts,
      status: props.status,
      targetId: props.targetId,
      targetType: props.targetType,
      updatedAt: props.updatedAt.toISOString(),
    };

    if (props.completedAt) dto.completedAt = props.completedAt.toISOString();
    if (props.configurationReference !== undefined) dto.configurationReference = props.configurationReference;
    if (props.lastErrorCode !== undefined) dto.lastErrorCode = props.lastErrorCode;
    if (props.lastErrorMessage !== undefined) dto.lastErrorMessage = props.lastErrorMessage;
    if (props.nextAttemptAt) dto.nextAttemptAt = props.nextAttemptAt.toISOString();
    if (props.processingStartedAt) dto.processingStartedAt = props.processingStartedAt.toISOString();
    if (props.processingWorkerId !== undefined) dto.processingWorkerId = props.processingWorkerId;
    if (props.sourceExecutionId !== undefined) dto.sourceExecutionId = props.sourceExecutionId;

    return dto as ProvisioningRequestDto;
  },
};
