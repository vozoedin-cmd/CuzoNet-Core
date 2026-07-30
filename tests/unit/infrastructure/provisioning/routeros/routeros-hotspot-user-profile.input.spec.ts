import { describe, it, expect } from 'vitest';

import { routerOsHotspotUserProfileInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-hotspot-user-profile.input.js';

const parse = (payload: unknown) => routerOsHotspotUserProfileInputSchema.safeParse(payload);

describe('routerOsHotspotUserProfileInputSchema', () => {
  describe('create', () => {
    it('validates a minimal payload', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('validates a full payload with every supported property', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        addMacCookie: true,
        addressList: 'hotspot-clients',
        addressPool: 'POOL-HOTSPOT',
        idleTimeout: 'none',
        keepaliveTimeout: '2m',
        macCookieTimeout: '4w2d',
        name: 'PERFIL-1',
        rateLimit: '5M/10M',
        routerId: 'router-1',
        sessionTimeout: '1h',
        sharedUsers: 'unlimited',
        statusAutorefresh: '1m',
        transparentProxy: false,
      }).success).to.equal(true);
    });

    it('accepts sharedUsers as a numeric string', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL-1',
        routerId: 'router-1',
        sharedUsers: '25',
      }).success).to.equal(true);
    });

    it('accepts an empty addressList (the RouterOS default meaning "none")', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        addressList: '',
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('rejects a missing name', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects sharedUsers = 0 or a non-numeric literal', () => {
      for (const sharedUsers of ['0', 'many', '-1', '1.5']) {
        expect(parse({
          actionType: 'routeros.hotspot.user_profile.create',
          name: 'PERFIL-1',
          routerId: 'router-1',
          sharedUsers,
        }).success, sharedUsers).to.equal(false);
      }
    });

    it('rejects malformed durations', () => {
      for (const sessionTimeout of ['forever', '10', '1x', '']) {
        expect(parse({
          actionType: 'routeros.hotspot.user_profile.create',
          name: 'PERFIL-1',
          routerId: 'router-1',
          sessionTimeout,
        }).success, sessionTimeout).to.equal(false);
      }
    });

    it('rejects a malformed rateLimit', () => {
      for (const rateLimit of ['5M', '5M/', '5X/5M', '5M/5M/5M']) {
        expect(parse({
          actionType: 'routeros.hotspot.user_profile.create',
          name: 'PERFIL-1',
          rateLimit,
          routerId: 'router-1',
        }).success, rateLimit).to.equal(false);
      }
    });

    it('rejects control characters in the name', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL\n1',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects onLogin and onLogout (profile-only scripts kept out of the contract)', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL-1',
        onLogin: ':log info "hola"',
        routerId: 'router-1',
      }).success).to.equal(false);

      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL-1',
        onLogout: ':log info "chao"',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects unknown fields (strict schema)', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        disabled: true,
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects addMacCookie=false combined with macCookieTimeout', () => {
      const result = parse({
        actionType: 'routeros.hotspot.user_profile.create',
        addMacCookie: false,
        macCookieTimeout: '3d',
        name: 'PERFIL-1',
        routerId: 'router-1',
      });

      expect(result.success).to.equal(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('addMacCookie'))).to.equal(true);
      }
    });

    it('allows addMacCookie=true combined with macCookieTimeout', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        addMacCookie: true,
        macCookieTimeout: '3d',
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('allows macCookieTimeout alone', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        macCookieTimeout: '3d',
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('allows addMacCookie=false alone', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.create',
        addMacCookie: false,
        name: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });
  });

  describe('update', () => {
    it('validates a payload with only the reference', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.update',
        profileReference: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('rejects a missing profileReference', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.update',
        rateLimit: '5M/5M',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('applies the same addMacCookie/macCookieTimeout rule', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.update',
        addMacCookie: false,
        macCookieTimeout: '3d',
        profileReference: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects onLogin on update too', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.update',
        onLogin: ':log info "x"',
        profileReference: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(false);
    });
  });

  describe('remove', () => {
    it('validates a payload with the reference', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.remove',
        profileReference: 'PERFIL-1',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('rejects configuration fields on remove (strict schema)', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.remove',
        profileReference: 'PERFIL-1',
        rateLimit: '5M/5M',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects a missing routerId', () => {
      expect(parse({
        actionType: 'routeros.hotspot.user_profile.remove',
        profileReference: 'PERFIL-1',
      }).success).to.equal(false);
    });
  });

  it('rejects an unknown actionType', () => {
    expect(parse({
      actionType: 'routeros.hotspot.user_profile.enable',
      profileReference: 'PERFIL-1',
      routerId: 'router-1',
    }).success).to.equal(false);
  });
});
