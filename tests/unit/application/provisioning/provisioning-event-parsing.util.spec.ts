import { describe, expect, it } from 'vitest';

import {
  extractRouterId,
  splitActionType,
} from '../../../../backend/application/use-cases/provisioning/shared/provisioning-event-parsing.util.js';

describe('splitActionType', () => {
  it('splits a dot-notation actionType into action and resourceType', () => {
    expect(splitActionType('routeros.hotspot.user.create')).toEqual({
      action: 'create',
      resourceType: 'routeros.hotspot.user',
    });
  });

  it('splits a two-segment actionType', () => {
    expect(splitActionType('routeros.simple_queue.create')).toEqual({
      action: 'create',
      resourceType: 'routeros.simple_queue',
    });
  });

  it('falls back to the full string for both fields when there is no dot', () => {
    expect(splitActionType('provision')).toEqual({ action: 'provision', resourceType: 'provision' });
  });
});

describe('extractRouterId', () => {
  it('extracts routerId from a valid JSON payload', () => {
    expect(extractRouterId(JSON.stringify({ routerId: 'router-1' }))).toBe('router-1');
  });

  it('returns undefined when routerId is missing', () => {
    expect(extractRouterId(JSON.stringify({ name: 'cliente-1' }))).toBeUndefined();
  });

  it('returns undefined when routerId is not a string', () => {
    expect(extractRouterId(JSON.stringify({ routerId: 123 }))).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(extractRouterId('{ not json')).toBeUndefined();
  });

  it('returns undefined for a JSON array or primitive', () => {
    expect(extractRouterId('[1,2,3]')).toBeUndefined();
    expect(extractRouterId('"just a string"')).toBeUndefined();
  });
});
