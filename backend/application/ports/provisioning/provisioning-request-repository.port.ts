import type { ProvisioningRequest, ProvisioningStatus } from '../../../domain/provisioning/provisioning-request.js';

export interface ProvisioningRequestFilters {
  actionType?: string;
  companyId?: string;
  status?: ProvisioningStatus;
}

export interface ProvisioningRequestPagination {
  limit: number;
  offset: number;
}

export interface ProvisioningRequestRepository {
  claimDue(limit: number, workerId: string, at: Date): Promise<readonly ProvisioningRequest[]>;
  findById(id: string): Promise<ProvisioningRequest | undefined>;
  findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<ProvisioningRequest | undefined>;
  list(filters: ProvisioningRequestFilters, pagination: ProvisioningRequestPagination): Promise<{ items: readonly ProvisioningRequest[]; total: number }>;
  save(request: ProvisioningRequest): Promise<void>;
  insertNew(request: ProvisioningRequest): Promise<'inserted' | 'conflict'>;
}
