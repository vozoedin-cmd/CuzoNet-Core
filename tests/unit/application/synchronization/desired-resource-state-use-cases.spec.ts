import { describe, it, expect, beforeEach } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../../backend/application/ports/id-generator.port.js';
import type { DesiredResourceStateRepository } from '../../../../backend/application/ports/synchronization/desired-resource-state-repository.port.js';
import { GetDesiredResourceState } from '../../../../backend/application/use-cases/synchronization/get-desired-resource-state.use-case.js';
import { ListDesiredResourceStates } from '../../../../backend/application/use-cases/synchronization/list-desired-resource-states.use-case.js';
import { RemoveDesiredResourceState } from '../../../../backend/application/use-cases/synchronization/remove-desired-resource-state.use-case.js';
import { SetDesiredResourceState } from '../../../../backend/application/use-cases/synchronization/set-desired-resource-state.use-case.js';
import type { DesiredResourceState } from '../../../../backend/domain/synchronization/desired-resource-state.js';
import type { SyncResourceType } from '../../../../backend/domain/synchronization/sync-resource-type.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
let now = new Date('2026-07-21T12:00:00.000Z');
const clock: Clock = { now: () => now };
let idCounter = 0;
const idGenerator: IdGenerator = { generate: () => `state-${++idCounter}` };

class InMemoryDesiredResourceStateRepository implements DesiredResourceStateRepository {
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

describe('SetDesiredResourceState / RemoveDesiredResourceState / GetDesiredResourceState / ListDesiredResourceStates', () => {
  let repository: InMemoryDesiredResourceStateRepository;
  let setState: SetDesiredResourceState;
  let removeState: RemoveDesiredResourceState;
  let getState: GetDesiredResourceState;
  let listStates: ListDesiredResourceStates;

  beforeEach(() => {
    idCounter = 0;
    now = new Date('2026-07-21T12:00:00.000Z');
    repository = new InMemoryDesiredResourceStateRepository();
    setState = new SetDesiredResourceState(repository, companyContext, clock, idGenerator);
    removeState = new RemoveDesiredResourceState(repository, companyContext, clock);
    getState = new GetDesiredResourceState(repository, companyContext);
    listStates = new ListDesiredResourceStates(repository, companyContext);
  });

  it('creates a brand-new desired state at revision 1', async () => {
    const dto = await setState.execute({
      desiredFields: { protocol: 'tcp' },
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });

    expect(dto).to.include({
      companyId: 'company-1',
      disabled: false,
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      revision: 1,
      routerId: 'router-1',
    });
    expect(dto.desiredFields).to.deep.equal({ protocol: 'tcp' });
  });

  it('replaces the desired state declaratively on a second call, bumping the revision', async () => {
    await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });
    now = new Date('2026-07-22T00:00:00.000Z');

    const dto = await setState.execute({
      desiredFields: { protocol: 'udp' },
      reference: 'r1',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });

    expect(dto.revision).to.equal(2);
    expect(dto.desiredFields).to.deep.equal({ protocol: 'udp' });
  });

  it('does not bump the revision when re-declaring an identical desired state', async () => {
    await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    const dto = await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    expect(dto.revision).to.equal(1);
  });

  it('gets a previously set desired state', async () => {
    await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    const dto = await getState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    expect(dto?.desiredFields).to.deep.equal({ protocol: 'tcp' });
  });

  it('returns undefined for a state that was never set', async () => {
    expect(await getState.execute({ reference: 'missing', resourceType: 'filter-rule', routerId: 'router-1' })).to.equal(undefined);
  });

  it('removes a desired state (soft-delete), after which get() returns undefined', async () => {
    await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    await removeState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    expect(await getState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' })).to.equal(undefined);
  });

  it('is idempotent when removing a state that was never set', async () => {
    await expect(removeState.execute({ reference: 'missing', resourceType: 'filter-rule', routerId: 'router-1' })).resolves.toBeUndefined();
  });

  it('is idempotent when removing an already-removed state', async () => {
    await setState.execute({ desiredFields: {}, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });
    await removeState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    await expect(removeState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' })).resolves.toBeUndefined();
  });

  it('re-declaring a removed resource resurrects it', async () => {
    await setState.execute({ desiredFields: { protocol: 'tcp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });
    await removeState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    const dto = await setState.execute({ desiredFields: { protocol: 'udp' }, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });

    expect(dto.desiredFields).to.deep.equal({ protocol: 'udp' });
    expect(await getState.execute({ reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' })).to.not.equal(undefined);
  });

  it('lists only non-deleted states for a router+resourceType', async () => {
    await setState.execute({ desiredFields: {}, reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' });
    await setState.execute({ desiredFields: {}, reference: 'r2', resourceType: 'filter-rule', routerId: 'router-1' });
    await removeState.execute({ reference: 'r2', resourceType: 'filter-rule', routerId: 'router-1' });
    await setState.execute({ desiredFields: {}, reference: 'r3', resourceType: 'nat-rule', routerId: 'router-1' });

    const filterRules = await listStates.execute('router-1', 'filter-rule');

    expect(filterRules.map((s) => s.reference)).to.deep.equal(['r1']);
  });
});
