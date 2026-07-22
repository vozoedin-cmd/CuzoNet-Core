import { describe, it, expect } from 'vitest';

import type {
  ProvisioningRequestFilters,
  ProvisioningRequestPagination,
  ProvisioningRequestRepository,
} from '../../../../backend/application/ports/provisioning/provisioning-request-repository.port.js';
import { discoverRouterIds } from '../../../../backend/application/use-cases/synchronization/discover-router-ids.util.js';
import { ProvisioningRequest } from '../../../../backend/domain/provisioning/provisioning-request.js';

const now = new Date('2026-07-21T12:00:00.000Z');

function completedRequest(companyId: string, routerId: string | undefined, id: string): ProvisioningRequest {
  const request = ProvisioningRequest.create({
    actionType: 'routeros.firewall.filter.add',
    companyId,
    configurationReference: undefined,
    id,
    idempotencyKey: `key-${id}`,
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify(routerId !== undefined ? { routerId } : {}),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', now);
  request.complete(now);
  return request;
}

class FakeProvisioningRequestRepository implements ProvisioningRequestRepository {
  public constructor(private readonly requests: ProvisioningRequest[]) {}

  public async claimDue(): Promise<readonly ProvisioningRequest[]> {
    return [];
  }

  public async findById(): Promise<ProvisioningRequest | undefined> {
    return undefined;
  }

  public async findByIdempotencyKey(): Promise<ProvisioningRequest | undefined> {
    return undefined;
  }

  public async list(
    filters: ProvisioningRequestFilters,
    pagination: ProvisioningRequestPagination,
  ): Promise<{ items: readonly ProvisioningRequest[]; total: number }> {
    const filtered = this.requests.filter(
      (r) => (!filters.companyId || r.companyId === filters.companyId) && (!filters.status || r.status === filters.status),
    );
    return { items: filtered.slice(pagination.offset, pagination.offset + pagination.limit), total: filtered.length };
  }

  public async save(): Promise<void> {}

  public async insertNew(): Promise<'inserted' | 'conflict'> {
    return 'inserted';
  }
}

describe('discoverRouterIds', () => {
  it('returns distinct routerIds found across completed requests', async () => {
    const repo = new FakeProvisioningRequestRepository([
      completedRequest('company-1', 'router-1', 'req-1'),
      completedRequest('company-1', 'router-2', 'req-2'),
      completedRequest('company-1', 'router-1', 'req-3'),
    ]);

    expect((await discoverRouterIds(repo, 'company-1')).sort()).to.deep.equal(['router-1', 'router-2']);
  });

  it('ignores requests whose payload carries no routerId', async () => {
    const repo = new FakeProvisioningRequestRepository([completedRequest('company-1', undefined, 'req-1')]);

    expect(await discoverRouterIds(repo, 'company-1')).to.deep.equal([]);
  });

  it('returns an empty array when there is no completed history at all', async () => {
    const repo = new FakeProvisioningRequestRepository([]);

    expect(await discoverRouterIds(repo, 'company-1')).to.deep.equal([]);
  });

  it('only considers the given company', async () => {
    const repo = new FakeProvisioningRequestRepository([
      completedRequest('company-1', 'router-1', 'req-1'),
      completedRequest('company-2', 'router-2', 'req-2'),
    ]);

    expect(await discoverRouterIds(repo, 'company-1')).to.deep.equal(['router-1']);
  });

  it('paginates across more than one page of history', async () => {
    const requests = Array.from({ length: 250 }, (_, index) => completedRequest('company-1', `router-${index}`, `req-${index}`));
    const repo = new FakeProvisioningRequestRepository(requests);

    const routerIds = await discoverRouterIds(repo, 'company-1');

    expect(routerIds).to.have.length(250);
  });
});
