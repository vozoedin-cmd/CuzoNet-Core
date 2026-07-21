import { describe, it, expect } from 'vitest';

import { routerOsHotspotUserInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-hotspot-user.input.js';

describe('routerOsHotspotUserInputSchema', () => {
  it('validates a correct create payload', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      credentialReference: 'hotspot-password-cliente-1',
      limitBytesTotal: 1_000_000,
      limitUptime: '4h30m',
      name: 'cliente-1',
      profile: 'default',
      routerId: 'router-1',
      server: 'hotspot1',
      sharedUsers: 1,
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('invalidates a create payload with empty credentialReference', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      credentialReference: '',
      name: 'cliente-1',
      profile: 'default',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('invalidates a create payload that still carries a plaintext password field', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      name: 'cliente-1',
      password: 'password123',
      profile: 'default',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(false); // credentialReference is required; raw passwords are not accepted
  });

  it('invalidates a payload with control characters in the name', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      credentialReference: 'hotspot-password-cliente-1',
      name: 'cliente\n1',
      profile: 'default',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('rejects a limitUptime that does not match the RouterOS duration format', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      credentialReference: 'hotspot-password-cliente-1',
      limitUptime: 'forever',
      name: 'cliente-1',
      profile: 'default',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('accepts a clock-form limitUptime', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.create',
      credentialReference: 'hotspot-password-cliente-1',
      limitUptime: '01:30:00',
      name: 'cliente-1',
      profile: 'default',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct update payload', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.update',
      profile: 'premium',
      routerId: 'router-1',
      userReference: 'cliente-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct enable payload', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.enable',
      routerId: 'router-1',
      userReference: 'cliente-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct disable payload', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.disable',
      routerId: 'router-1',
      userReference: 'cliente-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct remove payload', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.remove',
      routerId: 'router-1',
      userReference: 'cliente-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('rejects an unknown actionType', () => {
    const payload = {
      actionType: 'routeros.hotspot.user.unknown',
      routerId: 'router-1',
    };
    const result = routerOsHotspotUserInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });
});
