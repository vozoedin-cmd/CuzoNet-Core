import { describe, it, expect } from 'vitest';

import { compareNormalizedRecords } from '../../../../backend/domain/synchronization/reconciliation-comparator.js';
import type { NormalizedResourceRecord } from '../../../../backend/domain/synchronization/normalized-resource-record.js';

function record(reference: string, fields: Record<string, string> = {}, disabled = false): NormalizedResourceRecord {
  return { disabled, fields, reference };
}

describe('compareNormalizedRecords', () => {
  it('reports in_sync when a reference exists on both sides with identical fields', () => {
    const desired = [record('r1', { protocol: 'tcp' })];
    const actual = [record('r1', { protocol: 'tcp' })];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reference: 'r1', status: 'in_sync' });
    expect(items[0]?.differingFields).to.equal(undefined);
  });

  it('reports missing when a reference is desired but absent from actual', () => {
    const desired = [record('r1', { protocol: 'tcp' })];
    const actual: NormalizedResourceRecord[] = [];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reference: 'r1', status: 'missing' });
    expect(items[0]?.desiredFields).to.deep.equal({ protocol: 'tcp' });
    expect(items[0]?.actualFields).to.equal(undefined);
  });

  it('reports unexpected when a reference exists in actual but was never desired', () => {
    const desired: NormalizedResourceRecord[] = [];
    const actual = [record('r1', { protocol: 'tcp' })];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reference: 'r1', status: 'unexpected' });
    expect(items[0]?.actualFields).to.deep.equal({ protocol: 'tcp' });
  });

  it('reports drifted when a field differs, listing the differing field names', () => {
    const desired = [record('r1', { dstPort: '22', protocol: 'tcp' })];
    const actual = [record('r1', { dstPort: '2222', protocol: 'tcp' })];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items[0]).toMatchObject({ status: 'drifted' });
    expect(items[0]?.differingFields).to.deep.equal(['dstPort']);
  });

  it('treats a disabled-flag mismatch as drift, reported via the synthetic "disabled" field', () => {
    const desired = [record('r1', {}, false)];
    const actual = [record('r1', {}, true)];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items[0]).toMatchObject({ status: 'drifted' });
    expect(items[0]?.differingFields).to.deep.equal(['disabled']);
  });

  it('treats a field present on only one side as drift', () => {
    const desired = [record('r1', { comment: 'x' })];
    const actual = [record('r1', {})];

    const items = compareNormalizedRecords('address-list-entry', desired, actual);

    expect(items[0]).toMatchObject({ status: 'drifted' });
    expect(items[0]?.differingFields).to.deep.equal(['comment']);
  });

  it('handles multiple references independently, matching purely by reference', () => {
    const desired = [record('r1', { protocol: 'tcp' }), record('r2', { protocol: 'udp' })];
    const actual = [record('r1', { protocol: 'tcp' }), record('r3', { protocol: 'icmp' })];

    const items = compareNormalizedRecords('filter-rule', desired, actual);
    const byReference = new Map(items.map((item) => [item.reference, item.status]));

    expect(byReference.get('r1')).to.equal('in_sync');
    expect(byReference.get('r2')).to.equal('missing');
    expect(byReference.get('r3')).to.equal('unexpected');
    expect(items).toHaveLength(3);
  });

  it('returns an empty array when both sides are empty', () => {
    expect(compareNormalizedRecords('mangle-rule', [], [])).to.deep.equal([]);
  });
});
