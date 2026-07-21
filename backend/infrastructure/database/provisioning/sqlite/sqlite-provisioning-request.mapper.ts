import type { ProvisioningRequestTable } from '../../sqlite/database-schema.js';
import { ProvisioningRequest, type ProvisioningStatus } from '../../../../domain/provisioning/provisioning-request.js';

export const SqliteProvisioningRequestMapper = {
  toDomain(row: ProvisioningRequestTable): ProvisioningRequest {
    return ProvisioningRequest.rehydrate({
      actionType: row.action_type,
      attemptCount: row.attempt_count,
      companyId: row.company_id,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      configurationReference: row.configuration_reference ?? undefined,
      createdAt: new Date(row.created_at),
      id: row.id,
      idempotencyKey: row.idempotency_key,
      inputHash: row.input_hash,
      inputSnapshotJson: row.input_snapshot_json,
      lastErrorCode: row.last_error_code ?? undefined,
      lastErrorMessage: row.last_error_message ?? undefined,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : undefined,
      processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at) : undefined,
      processingWorkerId: row.processing_worker_id ?? undefined,
      sourceExecutionId: row.source_execution_id ?? undefined,
      status: row.status as ProvisioningStatus,
      targetId: row.target_id,
      targetType: row.target_type,
      updatedAt: new Date(row.updated_at),
    });
  },

  toPersistence(domain: ProvisioningRequest): ProvisioningRequestTable {
    const props = domain.toProps();
    return {
      action_type: props.actionType,
      attempt_count: props.attemptCount,
      company_id: props.companyId,
      completed_at: props.completedAt ? props.completedAt.toISOString() : null,
      configuration_reference: props.configurationReference ?? null,
      created_at: props.createdAt.toISOString(),
      id: props.id,
      idempotency_key: props.idempotencyKey,
      input_hash: props.inputHash,
      input_snapshot_json: props.inputSnapshotJson,
      last_error_code: props.lastErrorCode ?? null,
      last_error_message: props.lastErrorMessage ?? null,
      max_attempts: props.maxAttempts,
      next_attempt_at: props.nextAttemptAt ? props.nextAttemptAt.toISOString() : null,
      processing_started_at: props.processingStartedAt ? props.processingStartedAt.toISOString() : null,
      processing_worker_id: props.processingWorkerId ?? null,
      source_execution_id: props.sourceExecutionId ?? null,
      status: props.status,
      target_id: props.targetId,
      target_type: props.targetType,
      updated_at: props.updatedAt.toISOString(),
    };
  },
};
