import { describe, it, expect, beforeEach } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../../backend/application/ports/id-generator.port.js';
import type {
  ProvisioningRequestFilters,
  ProvisioningRequestPagination,
  ProvisioningRequestRepository,
} from '../../../../backend/application/ports/provisioning/provisioning-request-repository.port.js';
import type { DesiredResourceStateRepository } from '../../../../backend/application/ports/synchronization/desired-resource-state-repository.port.js';
import type { DesiredStateRepository } from '../../../../backend/application/ports/synchronization/desired-state-repository.port.js';
import { BackfillDesiredState } from '../../../../backend/application/use-cases/synchronization/backfill-desired-state.use-case.js';
import { DesiredResourceState } from '../../../../backend/domain/synchronization/desired-resource-state.js';
import type { NormalizedResourceRecord } from '../../../../backend/domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../../../backend/domain/synchronization/sync-resource-type.js';
import { ProvisioningRequest } from '../../../../backend/domain/provisioning/provisioning-request.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
let idCounter = 0;
const idGenerator: IdGenerator = { generate: () => `state-${++idCounter}` };

class FakeDesiredStateRepository implements DesiredStateRepository {
  public constructor(private readonly records: Record<string, NormalizedResourceRecord[]>) {}

  public async getDesiredState(_companyId: string, routerId: string, resourceType: SyncResourceType) {
    return this.records[`${routerId}:${resourceType}`] ?? [];
  }
}

class FakeDesiredResourceStateRepository implements DesiredResourceStateRepository {
  public states = new Map<string, DesiredResourceState>();

  private key(companyId: string, routerId: string, resourceType: string, reference: string): string {
    return `${companyId}:${routerId}:${resourceType}:${reference}`;
  }

  public async findByReference(companyId: string, routerId: string, resourceType: SyncResourceType, reference: string) {
    return this.states.get(this.key(companyId, routerId, resourceType, reference));
  }

  public async listByRouter(companyId: string, routerId: string, resourceType: SyncResourceType) {
    return [...this.states.values()].filter(
      (s) => s.companyId === companyId && s.routerId === routerId && s.resourceType === resourceType && !s.isDeleted,
    );
  }

  public async save(state: DesiredResourceState): Promise<void> {
    this.states.set(this.key(state.companyId, state.routerId, state.resourceType, state.reference), state);
  }
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
    const items = filtered.slice(pagination.offset, pagination.offset + pagination.limit);
    return { items, total: filtered.length };
  }

  public async save(): Promise<void> {}

  public async insertNew(): Promise<'inserted' | 'conflict'> {
    return 'inserted';
  }
}

function completedRequest(routerId: string, id: string): ProvisioningRequest {
  const request = ProvisioningRequest.create({
    actionType: 'routeros.firewall.filter.add',
    companyId: 'company-1',
    configurationReference: undefined,
    id,
    idempotencyKey: `key-${id}`,
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify({ routerId }),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', clock.now());
  request.complete(clock.now());
  return request;
}

describe('BackfillDesiredState', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('discovers distinct routerIds from provisioning history when none are provided', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([
      completedRequest('router-1', 'req-1'),
      completedRequest('router-2', 'req-2'),
      completedRequest('router-1', 'req-3'),
    ]);
    const desiredStateRepo = new FakeDesiredStateRepository({});
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: true });

    expect(summary.totals.routersScanned).to.equal(2);
  });

  it('creates a desired-state row for every historical identity not already in the store', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({
      'router-1:filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }],
    });
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });

    expect(summary.totals).to.deep.equal({ created: 1, routersScanned: 1, scanned: 1, skipped: 0 });
    const created = await resourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1');
    expect(created?.desiredFields).to.deep.equal({ protocol: 'tcp' });
  });

  it('does not write anything in dry-run mode', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({
      'router-1:filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }],
    });
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: true, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });

    expect(summary.totals.created).to.equal(1);
    expect(await resourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1')).to.equal(undefined);
  });

  it('skips an identity that is already actively declared, without overwriting it', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({
      'router-1:filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }],
    });
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    await resourceStateRepo.save(
      DesiredResourceState.create(
        { companyId: 'company-1', desiredFields: { protocol: 'udp' }, disabled: false, id: 'manual-1', reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' },
        clock.now(),
      ),
    );
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });

    expect(summary.totals).to.deep.equal({ created: 0, routersScanned: 1, scanned: 1, skipped: 1 });
    const state = await resourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1');
    expect(state?.desiredFields).to.deep.equal({ protocol: 'udp' }); // untouched
  });

  it('skips an identity that was already explicitly soft-deleted, without resurrecting it', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({
      'router-1:filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }],
    });
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const removed = DesiredResourceState.create(
      { companyId: 'company-1', desiredFields: {}, disabled: false, id: 'manual-1', reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' },
      clock.now(),
    );
    removed.markDeleted(clock.now());
    await resourceStateRepo.save(removed);
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });

    expect(summary.totals.skipped).to.equal(1);
    const state = await resourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1');
    expect(state?.isDeleted).to.equal(true); // still deleted, not resurrected
  });

  it('is idempotent: a second run creates nothing new', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({
      'router-1:filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }],
    });
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const first = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });
    const second = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule'], routerIds: ['router-1'] });

    expect(first.totals.created).to.equal(1);
    expect(second.totals).to.deep.equal({ created: 0, routersScanned: 1, scanned: 1, skipped: 1 });
  });

  it('omits router+resourceType combinations with no historical records from the per-router report', async () => {
    const requestRepo = new FakeProvisioningRequestRepository([]);
    const desiredStateRepo = new FakeDesiredStateRepository({});
    const resourceStateRepo = new FakeDesiredResourceStateRepository();
    const backfill = new BackfillDesiredState(desiredStateRepo, resourceStateRepo, requestRepo, companyContext, clock, idGenerator);

    const summary = await backfill.execute({ dryRun: false, resourceTypes: ['filter-rule', 'nat-rule'], routerIds: ['router-1'] });

    expect(summary.perRouter).to.deep.equal([]);
    expect(summary.totals).to.deep.equal({ created: 0, routersScanned: 1, scanned: 0, skipped: 0 });
  });
});
