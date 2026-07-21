import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient hotspot users', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('creates a user with defaults applied', async () => {
    await client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' });

    expect(client.hotspotUsers).to.have.length(1);
    expect(client.hotspotUsers[0]).to.include({ disabled: false, name: 'user-1', profile: 'default' });
    expect(client.hotspotUsers[0]?.id).to.match(/^\*\d+$/);
  });

  it('finds a user by name and by id', async () => {
    await client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' });
    const created = client.hotspotUsers[0]!;

    expect(await client.findHotspotUser({ name: 'user-1' })).to.include({ id: created.id });
    expect(await client.findHotspotUser({ id: created.id })).to.include({ name: 'user-1' });
    expect(await client.findHotspotUser({ name: 'missing' })).to.equal(null);
  });

  it('enables and disables a user', async () => {
    await client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' });

    await client.disableHotspotUser({ name: 'user-1' });
    expect(client.hotspotUsers[0]?.disabled).to.equal(true);

    await client.enableHotspotUser({ name: 'user-1' });
    expect(client.hotspotUsers[0]?.disabled).to.equal(false);
  });

  it('no-ops enable/disable/remove/update when the user does not exist', async () => {
    await expect(client.disableHotspotUser({ name: 'missing' })).resolves.toBeUndefined();
    await expect(client.enableHotspotUser({ name: 'missing' })).resolves.toBeUndefined();
    await expect(client.removeHotspotUser({ name: 'missing' })).resolves.toBeUndefined();
    await expect(client.updateHotspotUser({ name: 'missing' }, { profile: 'x' })).resolves.toBeUndefined();
  });

  it('updates only the provided fields', async () => {
    await client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' });

    await client.updateHotspotUser({ name: 'user-1' }, { profile: 'premium' });

    expect(client.hotspotUsers[0]).to.include({ name: 'user-1', password: 'pass', profile: 'premium' });
  });

  it('removes a user', async () => {
    await client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' });

    await client.removeHotspotUser({ name: 'user-1' });

    expect(client.hotspotUsers).to.have.length(0);
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(client.createHotspotUser({ name: 'user-1', password: 'pass', profile: 'default' })).rejects.toThrow(
      'Client is closed',
    );
    await expect(client.findHotspotUser({ name: 'user-1' })).rejects.toThrow('Client is closed');
  });
});
