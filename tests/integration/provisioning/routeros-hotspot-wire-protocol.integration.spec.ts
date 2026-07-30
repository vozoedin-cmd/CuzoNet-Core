import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Regression coverage for the `disabled` boolean-parsing bug already fixed for
 * Simple Queue and PPPoE: the RouterOS binary API represents booleans as
 * "yes"/"no", never "true"/"false" (that form is exclusive to the REST API).
 * `findHotspotUser()` used to check `reply.disabled === 'true'`, which never
 * matches a real router response.
 */
describe('LibraryRouterOsClient wire protocol (Hotspot) — disabled parsing', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('maps disabled="yes" to true', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      disabled: 'yes',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const user = await client.findHotspotUser({ name: 'cliente-hotspot-001' });
      expect(user?.disabled).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('maps disabled="no" to false', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      disabled: 'no',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const user = await client.findHotspotUser({ name: 'cliente-hotspot-001' });
      expect(user?.disabled).toBe(false);
    } finally {
      await client.close();
    }
  });

  it('maps a missing disabled field to false', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const user = await client.findHotspotUser({ name: 'cliente-hotspot-001' });
      expect(user?.disabled).toBe(false);
    } finally {
      await client.close();
    }
  });

  it('still accepts the legacy REST-style "true" value (kept for tolerance, matching Simple Queue/PPPoE)', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      disabled: 'true',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const user = await client.findHotspotUser({ name: 'cliente-hotspot-001' });
      expect(user?.disabled).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('maps any other non-affirmative value to false', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      disabled: 'maybe',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      const user = await client.findHotspotUser({ name: 'cliente-hotspot-001' });
      expect(user?.disabled).toBe(false);
    } finally {
      await client.close();
    }
  });
});

/**
 * Regression coverage for the E2E-discovered bug: `shared-users` belongs to
 * /ip/hotspot/user/profile, NOT to /ip/hotspot/user. Sending it in an
 * add/set made RouterOS 7.21.4 reply "unknown parameter shared-users",
 * breaking every Hotspot Create/Update that carried the field.
 */
describe('LibraryRouterOsClient wire protocol (Hotspot) — shared-users must never reach the wire', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('createHotspotUser never sends a shared-users attribute', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createHotspotUser({
        comment: 'E2E',
        disabled: false,
        limitBytesTotal: 10485760,
        limitUptime: '30m',
        name: 'cliente-hotspot-001',
        password: 'irrelevant',
        profile: 'default',
        server: 'hotspot1',
      });
    } finally {
      await client.close();
    }

    const add = harness.captured.find((entry) => entry.command === '/ip/hotspot/user/add');
    expect(add).toBeDefined();
    expect(Object.keys(add?.attributes ?? {})).not.toContain('shared-users');
    expect(add?.attributes).toEqual({
      comment: 'E2E',
      disabled: 'no',
      'limit-bytes-total': '10485760',
      'limit-uptime': '30m',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
      server: 'hotspot1',
    });
  });

  it('updateHotspotUser never sends a shared-users attribute', async () => {
    harness.existingRecord = {
      '.id': '*H1',
      disabled: 'no',
      name: 'cliente-hotspot-001',
      password: 'irrelevant',
      profile: 'default',
    };
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.updateHotspotUser({ name: 'cliente-hotspot-001' }, { profile: 'premium' });
    } finally {
      await client.close();
    }

    const set = harness.captured.find((entry) => entry.command === '/ip/hotspot/user/set');
    expect(set).toBeDefined();
    expect(Object.keys(set?.attributes ?? {})).not.toContain('shared-users');
    expect(set?.attributes).toEqual({ numbers: '*H1', profile: 'premium' });
  });

  it('findHotspotUser never requests shared-users in the .proplist', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findHotspotUser({ name: 'cliente-hotspot-001' });
    } finally {
      await client.close();
    }

    const print = harness.captured.find((entry) => entry.command === '/ip/hotspot/user/print');
    expect(print?.attributes['.proplist']).not.toContain('shared-users');
  });
});
