import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Wire-protocol coverage for /ip/hotspot/user/profile against real RouterOS binary
 * framing. Locks in the lessons from the Hotspot User certification: no duplicated
 * `/print` suffix, `?name=` as the selector, and `on-login`/`on-logout` must never be
 * requested or sent.
 */
describe('LibraryRouterOsClient wire protocol (Hotspot User Profile)', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  const existing = {
    '.id': '*P1',
    'add-mac-cookie': 'true',
    'address-list': '',
    default: 'false',
    'idle-timeout': 'none',
    'keepalive-timeout': '2m',
    'mac-cookie-timeout': '3d',
    name: 'PERFIL-E2E',
    'shared-users': '1',
    'status-autorefresh': '1m',
    'transparent-proxy': 'false',
  };

  it('findHotspotUserProfile sends /ip/hotspot/user/profile/print with ?name= and no duplicated suffix', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findHotspotUserProfile({ name: 'PERFIL-E2E' });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/ip/hotspot/user/profile/print');
    expect(harness.captured[0]?.queries).toEqual(['?name=PERFIL-E2E']);
  });

  it('never requests on-login or on-logout in the .proplist (they may carry secrets)', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findHotspotUserProfile({ name: 'PERFIL-E2E' });
      await client.listHotspotUserProfiles();
    } finally {
      await client.close();
    }

    for (const entry of harness.captured) {
      expect(entry.attributes['.proplist']).not.toContain('on-login');
      expect(entry.attributes['.proplist']).not.toContain('on-logout');
    }
  });

  it('requests every supported property in the .proplist', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findHotspotUserProfile({ name: 'PERFIL-E2E' });
    } finally {
      await client.close();
    }

    const proplist = harness.captured[0]?.attributes['.proplist'] ?? '';
    for (const prop of [
      '.id',
      'name',
      'default',
      'address-pool',
      'session-timeout',
      'idle-timeout',
      'keepalive-timeout',
      'status-autorefresh',
      'shared-users',
      'rate-limit',
      'add-mac-cookie',
      'mac-cookie-timeout',
      'address-list',
      'transparent-proxy',
    ]) {
      expect(proplist).toContain(prop);
    }
  });

  it('createHotspotUserProfile sends /add with the exact attribute names RouterOS expects', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createHotspotUserProfile({
        addMacCookie: false,
        addressList: 'hotspot-clients',
        addressPool: 'POOL-HOTSPOT',
        idleTimeout: 'none',
        keepaliveTimeout: '2m',
        name: 'PERFIL-E2E',
        rateLimit: '5M/10M',
        sessionTimeout: '1h',
        sharedUsers: 'unlimited',
        statusAutorefresh: '1m',
        transparentProxy: false,
      });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/ip/hotspot/user/profile/add');
    expect(harness.captured[0]?.attributes).toEqual({
      'add-mac-cookie': 'no',
      'address-list': 'hotspot-clients',
      'address-pool': 'POOL-HOTSPOT',
      'idle-timeout': 'none',
      'keepalive-timeout': '2m',
      name: 'PERFIL-E2E',
      'rate-limit': '5M/10M',
      'session-timeout': '1h',
      'shared-users': 'unlimited',
      'status-autorefresh': '1m',
      'transparent-proxy': 'no',
    });
  });

  it('createHotspotUserProfile sends only name when nothing else is provided', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createHotspotUserProfile({ name: 'PERFIL-MINIMO' });
    } finally {
      await client.close();
    }

    expect(harness.captured[0]?.attributes).toEqual({ name: 'PERFIL-MINIMO' });
  });

  it('createHotspotUserProfile never sends on-login/on-logout', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createHotspotUserProfile({ name: 'PERFIL-E2E', sessionTimeout: '1h' });
    } finally {
      await client.close();
    }

    const keys = Object.keys(harness.captured[0]?.attributes ?? {});
    expect(keys).not.toContain('on-login');
    expect(keys).not.toContain('on-logout');
  });

  it('updateHotspotUserProfile resolves the .id and sends /set with numbers', async () => {
    harness.existingRecord = existing;
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.updateHotspotUserProfile({ name: 'PERFIL-E2E' }, { rateLimit: '2M/4M' });
    } finally {
      await client.close();
    }

    expect(harness.captured.map((e) => e.command)).toEqual([
      '/ip/hotspot/user/profile/print',
      '/ip/hotspot/user/profile/set',
    ]);
    expect(harness.captured[0]?.queries).toEqual(['?name=PERFIL-E2E']);
    expect(harness.captured[1]?.attributes).toEqual({ numbers: '*P1', 'rate-limit': '2M/4M' });
  });

  it('updateHotspotUserProfile skips /set when there is nothing to change', async () => {
    harness.existingRecord = existing;
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.updateHotspotUserProfile({ name: 'PERFIL-E2E' }, {});
    } finally {
      await client.close();
    }

    expect(harness.captured.map((e) => e.command)).toEqual(['/ip/hotspot/user/profile/print']);
  });

  it('updateHotspotUserProfile does nothing when the profile is absent', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.updateHotspotUserProfile({ name: 'NO-EXISTE' }, { rateLimit: '2M/4M' });
    } finally {
      await client.close();
    }

    expect(harness.captured.map((e) => e.command)).toEqual(['/ip/hotspot/user/profile/print']);
  });

  it('removeHotspotUserProfile resolves the .id and sends /remove', async () => {
    harness.existingRecord = existing;
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.removeHotspotUserProfile({ name: 'PERFIL-E2E' });
    } finally {
      await client.close();
    }

    expect(harness.captured.map((e) => e.command)).toEqual([
      '/ip/hotspot/user/profile/print',
      '/ip/hotspot/user/profile/remove',
    ]);
    expect(harness.captured[1]?.attributes).toEqual({ numbers: '*P1' });
  });

  it('removeHotspotUserProfile does not send /remove when the profile is absent', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.removeHotspotUserProfile({ name: 'NO-EXISTE' });
    } finally {
      await client.close();
    }

    expect(harness.captured.map((e) => e.command)).toEqual(['/ip/hotspot/user/profile/print']);
  });

  it('maps the router reply into the domain shape, parsing booleans and the default flag', async () => {
    harness.existingRecord = {
      ...existing,
      'add-mac-cookie': 'true',
      'address-pool': 'POOL-HOTSPOT',
      default: 'true',
      'rate-limit': '5M/5M',
      'session-timeout': '1h',
      'shared-users': 'unlimited',
      'transparent-proxy': 'false',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    let profile;
    try {
      profile = await client.findHotspotUserProfile({ name: 'PERFIL-E2E' });
    } finally {
      await client.close();
    }

    expect(profile).toEqual({
      addMacCookie: true,
      addressList: '',
      addressPool: 'POOL-HOTSPOT',
      id: '*P1',
      idleTimeout: 'none',
      isDefault: true,
      keepaliveTimeout: '2m',
      macCookieTimeout: '3d',
      name: 'PERFIL-E2E',
      rateLimit: '5M/5M',
      sessionTimeout: '1h',
      sharedUsers: 'unlimited',
      statusAutorefresh: '1m',
      transparentProxy: false,
    });
  });

  it('treats a profile without the default flag as not protected', async () => {
    const { default: _omitted, ...withoutFlag } = existing;
    harness.existingRecord = withoutFlag;
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const profile = await client.findHotspotUserProfile({ name: 'PERFIL-E2E' });
      expect(profile?.isDefault).toBe(false);
    } finally {
      await client.close();
    }
  });

  it('listHotspotUserProfiles sends /print with no query filter', async () => {
    harness.existingRecord = existing;
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const all = await client.listHotspotUserProfiles();
      expect(all).toHaveLength(1);
    } finally {
      await client.close();
    }

    expect(harness.captured[0]?.command).toBe('/ip/hotspot/user/profile/print');
    expect(harness.captured[0]?.queries).toEqual([]);
  });
});
