import { describe, it, expect } from 'vitest';

import { compareNormalizedRecords } from '../../../../backend/domain/synchronization/reconciliation-comparator.js';
import { InvalidDesiredResourceStateError } from '../../../../backend/domain/synchronization/errors/invalid-desired-resource-state.error.js';
import type { NormalizedResourceRecord } from '../../../../backend/domain/synchronization/normalized-resource-record.js';
import { SYNC_RESOURCE_TYPES } from '../../../../backend/domain/synchronization/sync-resource-type.js';

function record(
  reference: string,
  fields: Record<string, string> = {},
  disabled = false,
): NormalizedResourceRecord {
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

  it.each(SYNC_RESOURCE_TYPES)(
    'reports one ordered ambiguous item for an actual-only duplicate of resource type %s',
    (resourceType) => {
      const actual = [
        record('duplicate-reference', { variant: 'first' }),
        record('duplicate-reference', { variant: 'second' }, true),
      ];

      const items = compareNormalizedRecords(resourceType, [], actual);

      expect(items).toHaveLength(1);
      expect(items[0]).to.deep.equal({
        actualCandidates: [
          { disabled: false, fields: { variant: 'first' } },
          { disabled: true, fields: { variant: 'second' } },
        ],
        actualFields: undefined,
        actualMatchCount: 2,
        desiredFields: undefined,
        differingFields: undefined,
        reference: 'duplicate-reference',
        resourceType,
        status: 'ambiguous',
      });
    },
  );

  it('reports ambiguous when one actual candidate matches desired instead of selecting that candidate', () => {
    const desired = [record('r1', { protocol: 'tcp' })];
    const actual = [record('r1', { protocol: 'tcp' }), record('r1', { protocol: 'udp' })];

    const items = compareNormalizedRecords('filter-rule', desired, actual);

    expect(items).toHaveLength(1);
    expect(items[0]).to.deep.equal({
      actualCandidates: [
        { disabled: false, fields: { protocol: 'tcp' } },
        { disabled: false, fields: { protocol: 'udp' } },
      ],
      actualFields: undefined,
      actualMatchCount: 2,
      desiredFields: { protocol: 'tcp' },
      differingFields: undefined,
      reference: 'r1',
      resourceType: 'filter-rule',
      status: 'ambiguous',
    });
  });

  it('keeps both comments in order for the real MOROSOS duplicate regression', () => {
    const reference = 'MOROSOS:192.168.13.254';
    const actual = [
      record(reference, { comment: 'moroso original' }),
      record(reference, { comment: 'moroso duplicado' }),
    ];

    const items = compareNormalizedRecords('address-list-entry', [], actual);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      actualCandidates: [
        { disabled: false, fields: { comment: 'moroso original' } },
        { disabled: false, fields: { comment: 'moroso duplicado' } },
      ],
      actualFields: undefined,
      actualMatchCount: 2,
      reference,
      status: 'ambiguous',
    });
  });

  it('rejects duplicate desired references explicitly', () => {
    const desired = [
      record('duplicate-reference', { variant: 'first' }),
      record('duplicate-reference', { variant: 'second' }),
    ];

    expect(() => compareNormalizedRecords('nat-rule', desired, [])).toThrow(
      InvalidDesiredResourceStateError,
    );
  });

  it('returns an empty array when both sides are empty', () => {
    expect(compareNormalizedRecords('mangle-rule', [], [])).to.deep.equal([]);
  });
});
