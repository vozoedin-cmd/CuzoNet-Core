import type { ProvisioningRequestFilters, ProvisioningRequestPagination, ProvisioningRequestRepository } from '../../../../application/ports/provisioning/provisioning-request-repository.port.js';
import type { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';

export class InMemoryProvisioningRequestRepository implements ProvisioningRequestRepository {
  public requests = new Map<string, ProvisioningRequest>();

  public async save(request: ProvisioningRequest): Promise<void> {
    this.requests.set(request.id, request);
  }

  public async insertNew(request: ProvisioningRequest): Promise<'inserted' | 'conflict'> {
    const existing = await this.findByIdempotencyKey(request.companyId, request.idempotencyKey);
    if (existing) {
      return 'conflict';
    }
    this.requests.set(request.id, request);
    return 'inserted';
  }

  public async findById(id: string): Promise<ProvisioningRequest | undefined> {
    return this.requests.get(id);
  }

  public async findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<ProvisioningRequest | undefined> {
    for (const req of this.requests.values()) {
      if (req.companyId === companyId && req.idempotencyKey === idempotencyKey) {
        return req;
      }
    }
    return undefined;
  }

  public async claimDue(limit: number, workerId: string, at: Date): Promise<readonly ProvisioningRequest[]> {
    const claims: ProvisioningRequest[] = [];
    const now = at.getTime();

    for (const req of this.requests.values()) {
      if (claims.length >= limit) break;
      
      if (req.status === 'pending') {
        if (!req.nextAttemptAt || req.nextAttemptAt.getTime() <= now) {
          req.claim(workerId, at);
          claims.push(req);
        }
      } else if (req.status === 'failed' && req.nextAttemptAt && req.nextAttemptAt.getTime() <= now && req.attemptCount < req.maxAttempts) {
        req.claim(workerId, at);
        claims.push(req);
      }
    }

    return claims;
  }

  public async list(
    filters: ProvisioningRequestFilters,
    pagination: ProvisioningRequestPagination,
  ): Promise<{ items: readonly ProvisioningRequest[]; total: number }> {
    let filtered = Array.from(this.requests.values());

    if (filters.companyId) {
      filtered = filtered.filter(req => req.companyId === filters.companyId);
    }
    if (filters.status) {
      filtered = filtered.filter(req => req.status === filters.status);
    }
    if (filters.actionType) {
      filtered = filtered.filter(req => req.actionType === filters.actionType);
    }

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const items = filtered.slice(pagination.offset, pagination.offset + pagination.limit);

    return {
      items,
      total: filtered.length,
    };
  }
}
