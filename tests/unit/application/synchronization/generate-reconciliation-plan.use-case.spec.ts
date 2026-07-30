import { describe, it, expect } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import type { ActualStateReader } from '../../../../backend/application/ports/synchronization/actual-state-reader.port.js';
import type { DesiredStateRepository } from '../../../../backend/application/ports/synchronization/desired-state-repository.port.js';
import { GenerateReconciliationPlan } from '../../../../backend/application/use-cases/synchronization/generate-reconciliation-plan.use-case.js';
import type { NormalizedResourceRecord } from '../../../../backend/domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../../../backend/domain/synchronization/sync-resource-type.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };

function buildFakePorts(
  desiredByType: Partial<Record<SyncResourceType, NormalizedResourceRecord[]>>,
  actualByType: Partial<Record<SyncResourceType, NormalizedResourceRecord[]>>,
): {
  actualStateReader: ActualStateReader;
  desiredStateRepository: DesiredStateRepository;
  readCalls: SyncResourceType[];
} {
  const readCalls: SyncResourceType[] = [];
  const desiredStateRepository: DesiredStateRepository = {
    getDesiredState: async (_companyId, _routerId, resourceType) =>
      desiredByType[resourceType] ?? [],
  };
  const actualStateReader: ActualStateReader = {
    readActualState: async (_companyId, _routerId, resourceType) => {
      readCalls.push(resourceType);
      return actualByType[resourceType] ?? [];
    },
  };
  return { actualStateReader, desiredStateRepository, readCalls };
}

describe('GenerateReconciliationPlan', () => {
  it('compares all five resource types by default', async () => {
    const { actualStateReader, desiredStateRepository, readCalls } = buildFakePorts({}, {});
    const useCase = new GenerateReconciliationPlan(
      desiredStateRepository,
      actualStateReader,
      companyContext,
      clock,
    );

    const plan = await useCase.execute({ routerId: 'router-1' });

    expect(readCalls.sort()).to.deep.equal(
      ['address-list-entry', 'filter-rule', 'mangle-rule', 'nat-rule', 'simple-queue'].sort(),
    );
    expect(plan.mode).to.equal('dry-run');
    expect(plan.routerId).to.equal('router-1');
    expect(plan.companyId).to.equal('company-1');
    expect(plan.generatedAt).to.equal('2026-07-21T12:00:00.000Z');
    expect(plan.summary).to.deep.equal({
      ambiguous: 0,
      drifted: 0,
      inSync: 0,
      isConverged: true,
      missing: 0,
      total: 0,
      unexpected: 0,
    });
  });

  it('restricts comparison to the requested resource types only', async () => {
    const { actualStateReader, desiredStateRepository, readCalls } = buildFakePorts({}, {});
    const useCase = new GenerateReconciliationPlan(
      desiredStateRepository,
      actualStateReader,
      companyContext,
      clock,
    );

    await useCase.execute({ resourceTypes: ['filter-rule', 'nat-rule'], routerId: 'router-1' });

    expect(readCalls.sort()).to.deep.equal(['filter-rule', 'nat-rule'].sort());
  });

  it('aggregates comparison results from the desired/actual ports into the plan items', async () => {
    const { actualStateReader, desiredStateRepository } = buildFakePorts(
      { 'filter-rule': [{ disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' }] },
      { 'filter-rule': [] },
    );
    const useCase = new GenerateReconciliationPlan(
      desiredStateRepository,
      actualStateReader,
      companyContext,
      clock,
    );

    const plan = await useCase.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });

    expect(plan.items).to.have.length(1);
    expect(plan.items[0]).to.include({
      reference: 'r1',
      resourceType: 'filter-rule',
      status: 'missing',
    });
    expect(plan.summary.missing).to.equal(1);
    expect(plan.summary.isConverged).to.equal(false);
  });

  it('maps ambiguous candidates and their summary into the plan DTO', async () => {
    const { actualStateReader, desiredStateRepository } = buildFakePorts(
      {},
      {
        'filter-rule': [
          { disabled: false, fields: { protocol: 'tcp' }, reference: 'r1' },
          { disabled: true, fields: { protocol: 'udp' }, reference: 'r1' },
        ],
      },
    );
    const useCase = new GenerateReconciliationPlan(
      desiredStateRepository,
      actualStateReader,
      companyContext,
      clock,
    );

    const plan = await useCase.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });

    expect(plan.items).to.deep.equal([
      {
        actualCandidates: [
          { disabled: false, fields: { protocol: 'tcp' } },
          { disabled: true, fields: { protocol: 'udp' } },
        ],
        actualMatchCount: 2,
        reference: 'r1',
        resourceType: 'filter-rule',
        status: 'ambiguous',
      },
    ]);
    expect(plan.summary).to.deep.equal({
      ambiguous: 1,
      drifted: 0,
      inSync: 0,
      isConverged: false,
      missing: 0,
      total: 1,
      unexpected: 0,
    });
  });
});
