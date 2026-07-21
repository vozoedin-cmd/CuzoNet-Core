import type { AutomationExecutionDto } from '../../dto/automation/automation-execution.dto.js';
import { AutomationExecution } from '../../../domain/automation/automation-execution.js';

export const AutomationExecutionMapper = {
  toDomain(dto: AutomationExecutionDto): AutomationExecution {
    return AutomationExecution.rehydrate({
      actionSnapshotJson: dto.actionSnapshotJson,
      actionType: dto.actionType,
      attemptCount: dto.attemptCount,
      cancelledAt: dto.cancelledAt ? new Date(dto.cancelledAt) : undefined,
      companyId: dto.companyId,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      createdAt: new Date(dto.createdAt),
      eventId: dto.eventId,
      eventSnapshotJson: dto.eventSnapshotJson,
      eventType: dto.eventType,
      id: dto.id,
      lastErrorCode: dto.lastErrorCode,
      lastErrorMessage: dto.lastErrorMessage,
      maxAttempts: dto.maxAttempts,
      nextAttemptAt: dto.nextAttemptAt ? new Date(dto.nextAttemptAt) : undefined,
      processingLeaseUntil: dto.processingLeaseUntil ? new Date(dto.processingLeaseUntil) : undefined,
      processingStartedAt: dto.processingStartedAt ? new Date(dto.processingStartedAt) : undefined,
      processingWorkerId: dto.processingWorkerId,
      providerExecutionId: dto.providerExecutionId,
      ruleId: dto.ruleId,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      status: dto.status,
      updatedAt: new Date(dto.updatedAt),
    });
  },

  toDto(execution: AutomationExecution): AutomationExecutionDto {
    const props = execution.toProps();
    return {
      actionSnapshotJson: props.actionSnapshotJson,
      actionType: props.actionType,
      attemptCount: props.attemptCount,
      cancelledAt: props.cancelledAt?.toISOString(),
      companyId: props.companyId,
      completedAt: props.completedAt?.toISOString(),
      createdAt: props.createdAt.toISOString(),
      eventId: props.eventId,
      eventSnapshotJson: props.eventSnapshotJson,
      eventType: props.eventType,
      id: props.id,
      lastErrorCode: props.lastErrorCode,
      lastErrorMessage: props.lastErrorMessage,
      maxAttempts: props.maxAttempts,
      nextAttemptAt: props.nextAttemptAt?.toISOString(),
      processingLeaseUntil: props.processingLeaseUntil?.toISOString(),
      processingStartedAt: props.processingStartedAt?.toISOString(),
      processingWorkerId: props.processingWorkerId,
      providerExecutionId: props.providerExecutionId,
      ruleId: props.ruleId,
      startedAt: props.startedAt?.toISOString(),
      status: props.status,
      updatedAt: props.updatedAt.toISOString(),
    };
  },
};
