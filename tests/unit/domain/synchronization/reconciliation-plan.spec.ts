import { describe, it, expect } from 'vitest';

import type { ReconciliationItem } from '../../../../backend/domain/synchronization/reconciliation-item.js';
import { ReconciliationPlan } from '../../../../backend/domain/synchronization/reconciliation-plan.js';
import { isActionableReconciliationStatus } from '../../../../backend/domain/synchronization/reconciliation-status.js';

function item(reference: string, status: ReconciliationItem['status']): ReconciliationItem {
  return {
    actualCandidates: undefined,
    actualFields: undefined,
    actualMatchCount: undefined,
    desiredFields: undefined,
    differingFields: undefined,
    reference,
    resourceType: 'filter-rule',
    status,
  };
}

describe('ReconciliationPlan', () => {
  it('computes a summary that tallies each status', () => {
    const items = [
      item('r1', 'in_sync'),
      item('r2', 'in_sync'),
      item('r3', 'missing'),
      item('r4', 'drifted'),
      item('r5', 'unexpected'),
      item('r6', 'ambiguous'),
    ];
    const generatedAt = new Date('2026-07-21T12:00:00.000Z');

    const plan = ReconciliationPlan.create('company-1', 'router-1', generatedAt, items);

    expect(plan.companyId).to.equal('company-1');
    expect(plan.routerId).to.equal('router-1');
    expect(plan.generatedAt).to.equal(generatedAt);
    expect(plan.mode).to.equal('dry-run');
    expect(plan.items).to.equal(items);
    expect(plan.summary).to.deep.equal({
      ambiguous: 1,
      drifted: 1,
      inSync: 2,
      isConverged: false,
      missing: 1,
      total: 6,
      unexpected: 1,
    });
  });

  it('computes an all-zero summary for an empty item list', () => {
    const plan = ReconciliationPlan.create('company-1', 'router-1', new Date(), []);

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

  it('only treats missing and drifted as actionable statuses', () => {
    expect(isActionableReconciliationStatus('missing')).to.equal(true);
    expect(isActionableReconciliationStatus('drifted')).to.equal(true);
    expect(isActionableReconciliationStatus('ambiguous')).to.equal(false);
    expect(isActionableReconciliationStatus('in_sync')).to.equal(false);
    expect(isActionableReconciliationStatus('unexpected')).to.equal(false);
  });

  it('does not let an informational unexpected item prevent convergence', () => {
    const plan = ReconciliationPlan.create('company-1', 'router-1', new Date(), [
      item('r1', 'unexpected'),
    ]);

    expect(plan.summary.isConverged).to.equal(true);
  });
});
