import { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';
import { OperationId } from '../../../../domain/provisioning/value-objects/operation-id.js';
import {
  OperationStatus,
  type OperationStatusValue,
} from '../../../../domain/provisioning/value-objects/operation-status.js';
import {
  OperationType,
  type OperationTypeValue,
} from '../../../../domain/provisioning/value-objects/operation-type.js';
import { ProvisionRequest } from '../../../../domain/provisioning/value-objects/provision-request.js';

export interface InMemoryProvisioningOperationRecord {
  attemptCount: number;
  causationId: string;
  companyId: string;
  completedAt: string | undefined;
  correlationId: string;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  ipAddressId: string | undefined;
  lastErrorCode: string | undefined;
  lastErrorMessage: string | undefined;
  maxAttempts: number;
  nextAttemptAt: string | undefined;
  requestedBy: string;
  routerId: string;
  serviceAddressId: string | undefined;
  serviceId: string;
  startedAt: string | undefined;
  status: OperationStatusValue;
  type: OperationTypeValue;
}

export const inMemoryProvisioningOperationMapper = {
  toRecord(operation: ProvisioningOperation): InMemoryProvisioningOperationRecord {
    return {
      attemptCount: operation.attemptCount,
      causationId: operation.causationId,
      companyId: operation.companyId,
      completedAt: operation.completedAt?.toISOString(),
      correlationId: operation.correlationId,
      createdAt: operation.createdAt.toISOString(),
      id: operation.id.value,
      idempotencyKey: operation.idempotencyKey,
      ipAddressId: operation.provisionRequest.ipAddressId,
      lastErrorCode: operation.lastErrorCode,
      lastErrorMessage: operation.lastErrorMessage,
      maxAttempts: operation.maxAttempts,
      nextAttemptAt: operation.nextAttemptAt?.toISOString(),
      requestedBy: operation.requestedBy,
      routerId: operation.provisionRequest.routerId,
      serviceAddressId: operation.provisionRequest.serviceAddressId,
      serviceId: operation.serviceId,
      startedAt: operation.startedAt?.toISOString(),
      status: operation.status.value,
      type: operation.type.value,
    };
  },

  toDomain(record: InMemoryProvisioningOperationRecord): ProvisioningOperation {
    return ProvisioningOperation.rehydrate({
      attemptCount: record.attemptCount,
      causationId: record.causationId,
      companyId: record.companyId,
      completedAt: record.completedAt === undefined ? undefined : new Date(record.completedAt),
      correlationId: record.correlationId,
      createdAt: new Date(record.createdAt),
      id: OperationId.create(record.id),
      idempotencyKey: record.idempotencyKey,
      lastErrorCode: record.lastErrorCode,
      lastErrorMessage: record.lastErrorMessage,
      maxAttempts: record.maxAttempts,
      nextAttemptAt:
        record.nextAttemptAt === undefined ? undefined : new Date(record.nextAttemptAt),
      provisionRequest: ProvisionRequest.create({
        routerId: record.routerId,
        ...(record.ipAddressId === undefined ? {} : { ipAddressId: record.ipAddressId }),
        ...(record.serviceAddressId === undefined
          ? {}
          : { serviceAddressId: record.serviceAddressId }),
      }),
      requestedBy: record.requestedBy,
      serviceId: record.serviceId,
      startedAt: record.startedAt === undefined ? undefined : new Date(record.startedAt),
      status: OperationStatus.create(record.status),
      type: OperationType.create(record.type),
    });
  },
};
