import { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';
import { OperationId } from '../../../../domain/provisioning/value-objects/operation-id.js';
import { OperationStatus } from '../../../../domain/provisioning/value-objects/operation-status.js';
import { OperationType } from '../../../../domain/provisioning/value-objects/operation-type.js';
import { ProvisionRequest } from '../../../../domain/provisioning/value-objects/provision-request.js';
import type { ProvisioningOperationTable } from '../../sqlite/database-schema.js';

export const sqliteProvisioningOperationMapper = {
  toDomain(record: ProvisioningOperationTable): ProvisioningOperation {
    return ProvisioningOperation.rehydrate({
      attemptCount: record.attempt_count,
      causationId: record.causation_id,
      companyId: record.company_id,
      completedAt: record.completed_at === null ? undefined : new Date(record.completed_at),
      correlationId: record.correlation_id,
      createdAt: new Date(record.created_at),
      id: OperationId.create(record.id),
      idempotencyKey: record.idempotency_key,
      lastErrorCode: record.last_error_code ?? undefined,
      lastErrorMessage: record.last_error_message ?? undefined,
      maxAttempts: record.max_attempts,
      nextAttemptAt:
        record.next_attempt_at === null ? undefined : new Date(record.next_attempt_at),
      provisionRequest: ProvisionRequest.create({
        routerId: record.router_id,
        ...(record.ip_address_id === null ? {} : { ipAddressId: record.ip_address_id }),
        ...(record.service_address_id === null
          ? {}
          : { serviceAddressId: record.service_address_id }),
      }),
      requestedBy: record.requested_by,
      serviceId: record.service_id,
      startedAt: record.started_at === null ? undefined : new Date(record.started_at),
      status: OperationStatus.create(record.status),
      type: OperationType.create(record.operation_type),
    });
  },
};
