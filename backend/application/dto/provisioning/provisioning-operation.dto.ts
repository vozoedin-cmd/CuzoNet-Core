import type { ProvisioningOperation } from '../../../domain/provisioning/provisioning-operation.js';
import type { OperationStatusValue } from '../../../domain/provisioning/value-objects/operation-status.js';
import type { OperationTypeValue } from '../../../domain/provisioning/value-objects/operation-type.js';

export interface RequestProvisioningOperationInput {
  causationId: string;
  correlationId: string;
  idempotencyKey: string;
  ipAddressId?: string;
  routerId: string;
  serviceAddressId?: string;
  serviceId: string;
  type: OperationTypeValue;
}

export interface GetProvisioningOperationInput {
  operationId: string;
}
export interface OperationAcceptedDto {
  correlationId: string;
  operationId: string;
  status: 'queued';
}
export interface ProvisioningOperationDto {
  attemptCount: number;
  completedAt: string | null;
  createdAt: string;
  id: string;
  lastError: string | null;
  serviceId: string;
  status: OperationStatusValue;
  type: OperationTypeValue;
}

export function toProvisioningOperationDto(
  operation: ProvisioningOperation,
): ProvisioningOperationDto {
  return {
    attemptCount: operation.attemptCount,
    completedAt: operation.completedAt?.toISOString() ?? null,
    createdAt: operation.createdAt.toISOString(),
    id: operation.id.value,
    lastError: operation.lastErrorMessage ?? null,
    serviceId: operation.serviceId,
    status: operation.status.value,
    type: operation.type.value,
  };
}
