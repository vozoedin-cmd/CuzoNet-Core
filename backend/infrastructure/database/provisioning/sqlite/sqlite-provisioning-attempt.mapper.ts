import type { ProvisioningAttemptTable } from '../../sqlite/database-schema.js';
import { ProvisioningAttempt, type ProvisioningAttemptOutcome } from '../../../../domain/provisioning/provisioning-attempt.js';

export const SqliteProvisioningAttemptMapper = {
  toDomain(row: ProvisioningAttemptTable): ProvisioningAttempt {
    return ProvisioningAttempt.rehydrate({
      attemptNumber: row.attempt_number,
      durationMs: row.duration_ms ?? undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
      id: row.id,
      metadataJson: row.metadata_json ?? undefined,
      outcome: row.outcome as ProvisioningAttemptOutcome,
      requestId: row.request_id,
      startedAt: new Date(row.started_at),
      workerId: row.worker_id,
    });
  },

  toPersistence(domain: ProvisioningAttempt): ProvisioningAttemptTable {
    const props = domain.toDto();
    return {
      attempt_number: props.attemptNumber,
      duration_ms: props.durationMs ?? null,
      error_code: props.errorCode ?? null,
      error_message: props.errorMessage ?? null,
      finished_at: props.finishedAt ?? null,
      id: props.id,
      metadata_json: props.metadataJson ?? null,
      outcome: props.outcome,
      request_id: props.requestId,
      started_at: props.startedAt,
      worker_id: props.workerId,
    };
  },
};
