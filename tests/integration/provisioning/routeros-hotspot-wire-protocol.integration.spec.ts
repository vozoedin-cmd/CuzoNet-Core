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
