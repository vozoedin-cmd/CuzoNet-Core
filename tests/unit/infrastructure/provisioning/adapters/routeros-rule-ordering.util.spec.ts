import { describe, it, expect } from 'vitest';

import {
  resolveMoveTarget,
  resolvePlaceBeforeId,
} from '../../../../../backend/infrastructure/provisioning/adapters/routeros-rule-ordering.util.js';

interface Rule {
  readonly id: string;
}

const rules: Rule[] = [{ id: '*1' }, { id: '*2' }, { id: '*3' }];

describe('resolvePlaceBeforeId', () => {
  it('resolves the id currently at the requested position', () => {
    expect(resolvePlaceBeforeId(rules, 0)).to.equal('*1');
    expect(resolvePlaceBeforeId(rules, 1)).to.equal('*2');
  });
  it('returns undefined when the position is at or beyond the end', () => {
    expect(resolvePlaceBeforeId(rules, 3)).to.equal(undefined);
    expect(resolvePlaceBeforeId(rules, 99)).to.equal(undefined);
  });
  it('returns undefined for an empty rule set', () => {
    expect(resolvePlaceBeforeId([], 0)).to.equal(undefined);
  });
});

describe('resolveMoveTarget', () => {
  it('resolves the target id excluding the rule being moved', () => {
    const target = resolveMoveTarget(rules, '*3', 0);
    expect(target.placeBeforeId).to.equal('*1');
    expect(target.alreadyAtPosition).to.equal(false);
  });
  it('reports alreadyAtPosition when the rule already precedes the resolved target', () => {
    const target = resolveMoveTarget(rules, '*1', 0);
    expect(target.alreadyAtPosition).to.equal(true);
  });
  it('resolves undefined (move to end) when the desired position is beyond the remaining rules', () => {
    const target = resolveMoveTarget(rules, '*1', 99);
    expect(target.placeBeforeId).to.equal(undefined);
    expect(target.alreadyAtPosition).to.equal(false);
  });
  it('reports alreadyAtPosition when the rule is already last and target position is beyond the end', () => {
    const target = resolveMoveTarget(rules, '*3', 99);
    expect(target.alreadyAtPosition).to.equal(true);
  });
});
