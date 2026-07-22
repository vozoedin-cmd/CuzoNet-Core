import { describe, it, expect } from 'vitest';

import { DesiredResourceState } from '../../../../backend/domain/synchronization/desired-resource-state.js';
import { InvalidDesiredResourceStateError } from '../../../../backend/domain/synchronization/errors/invalid-desired-resource-state.error.js';

function detailMessage(fn: () => unknown): string {
  try {
    fn();
    throw new Error('expected fn() to throw');
  } catch (error) {
    if (!(error instanceof InvalidDesiredResourceStateError)) throw error;
    return error.details?.[0]?.message ?? '';
  }
}

const at = new Date('2026-07-21T12:00:00.000Z');

function build(overrides: Partial<Parameters<typeof DesiredResourceState.create>[0]> = {}) {
  return DesiredResourceState.create(
    {
      companyId: 'company-1',
      desiredFields: { protocol: 'tcp' },
      disabled: false,
      id: 'state-1',
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
      ...overrides,
    },
    at,
  );
}

describe('DesiredResourceState', () => {
  describe('create', () => {
    it('starts at revision 1 with no deletedAt', () => {
      const state = build();
      expect(state.revision).to.equal(1);
      expect(state.deletedAt).to.equal(undefined);
      expect(state.isDeleted).to.equal(false);
      expect(state.createdAt).to.equal(at);
      expect(state.updatedAt).to.equal(at);
    });

    it('rejects an empty reference', () => {
      expect(() => build({ reference: '   ' })).to.throw(InvalidDesiredResourceStateError);
      expect(detailMessage(() => build({ reference: '   ' }))).to.match(/referencia/);
    });

    it('rejects an unknown resourceType', () => {
      const invalidResourceType = 'not-a-resource' as unknown as Parameters<typeof DesiredResourceState.create>[0]['resourceType'];
      expect(() => build({ resourceType: invalidResourceType })).to.throw(InvalidDesiredResourceStateError);
      expect(detailMessage(() => build({ resourceType: invalidResourceType }))).to.match(/Debe ser uno de/);
    });

    it('rejects a negative desiredPosition', () => {
      expect(() => build({ desiredPosition: -1 })).to.throw(InvalidDesiredResourceStateError);
      expect(detailMessage(() => build({ desiredPosition: -1 }))).to.match(/posición/);
    });

    it('accepts a valid desiredPosition', () => {
      const state = build({ desiredPosition: 3 });
      expect(state.desiredPosition).to.equal(3);
    });
  });

  describe('replace', () => {
    it('bumps the revision and updatedAt when a field actually changes', () => {
      const state = build();
      const later = new Date('2026-07-22T00:00:00.000Z');

      const changed = state.replace({ protocol: 'udp' }, false, undefined, later);

      expect(changed).to.equal(true);
      expect(state.revision).to.equal(2);
      expect(state.desiredFields).to.deep.equal({ protocol: 'udp' });
      expect(state.updatedAt).to.equal(later);
    });

    it('is a no-op when the declared shape is identical', () => {
      const state = build();

      const changed = state.replace({ protocol: 'tcp' }, false, undefined, new Date('2026-07-22T00:00:00.000Z'));

      expect(changed).to.equal(false);
      expect(state.revision).to.equal(1);
      expect(state.updatedAt).to.equal(at);
    });

    it('detects a disabled-only change', () => {
      const state = build();
      expect(state.replace({ protocol: 'tcp' }, true, undefined, new Date())).to.equal(true);
      expect(state.disabled).to.equal(true);
    });

    it('detects a desiredPosition-only change', () => {
      const state = build({ desiredPosition: 0 });
      expect(state.replace({ protocol: 'tcp' }, false, 5, new Date())).to.equal(true);
      expect(state.desiredPosition).to.equal(5);
    });

    it('resurrects a soft-deleted resource, always bumping the revision even if fields are unchanged', () => {
      const state = build();
      state.markDeleted(new Date('2026-07-22T00:00:00.000Z'));
      expect(state.revision).to.equal(2);

      const changed = state.replace({ protocol: 'tcp' }, false, undefined, new Date('2026-07-23T00:00:00.000Z'));

      expect(changed).to.equal(true);
      expect(state.isDeleted).to.equal(false);
      expect(state.revision).to.equal(3);
    });

    it('rejects an invalid desiredPosition on replace, just like on create', () => {
      const state = build();
      expect(() => state.replace({ protocol: 'tcp' }, false, -1, new Date())).to.throw(InvalidDesiredResourceStateError);
      expect(detailMessage(() => state.replace({ protocol: 'tcp' }, false, -1, new Date()))).to.match(/posición/);
    });
  });

  describe('markDeleted', () => {
    it('sets deletedAt and bumps the revision', () => {
      const state = build();
      const later = new Date('2026-07-22T00:00:00.000Z');

      const changed = state.markDeleted(later);

      expect(changed).to.equal(true);
      expect(state.isDeleted).to.equal(true);
      expect(state.deletedAt).to.equal(later);
      expect(state.revision).to.equal(2);
    });

    it('is idempotent: deleting an already-deleted resource is a no-op', () => {
      const state = build();
      state.markDeleted(new Date('2026-07-22T00:00:00.000Z'));

      const changed = state.markDeleted(new Date('2026-07-23T00:00:00.000Z'));

      expect(changed).to.equal(false);
      expect(state.revision).to.equal(2);
      expect(state.deletedAt).to.deep.equal(new Date('2026-07-22T00:00:00.000Z'));
    });
  });

  describe('rehydrate', () => {
    it('reconstructs a state with all props intact', () => {
      const props = {
        companyId: 'company-1',
        createdAt: at,
        deletedAt: undefined,
        desiredFields: { protocol: 'tcp' },
        desiredPosition: 2,
        disabled: true,
        id: 'state-1',
        reference: 'block-ssh-wan',
        resourceType: 'filter-rule' as const,
        revision: 4,
        routerId: 'router-1',
        updatedAt: at,
      };
      const state = DesiredResourceState.rehydrate(props);
      expect(state.toProps()).to.deep.equal(props);
    });
  });
});
