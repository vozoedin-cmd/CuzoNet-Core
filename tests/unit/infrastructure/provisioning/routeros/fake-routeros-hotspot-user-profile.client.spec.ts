import { describe, it, expect, beforeEach } from 'vitest';

import { ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient — hotspot user profiles', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('applies the same defaults RouterOS applies to a brand-new profile', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });

    const created = await client.findHotspotUserProfile({ name: 'perfil-1' });

    expect(created?.addMacCookie).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.addMacCookie);
    expect(created?.addressList).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.addressList);
    expect(created?.idleTimeout).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.idleTimeout);
    expect(created?.keepaliveTimeout).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.keepaliveTimeout);
    expect(created?.macCookieTimeout).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.macCookieTimeout);
    expect(created?.sharedUsers).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.sharedUsers);
    expect(created?.statusAutorefresh).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.statusAutorefresh);
    expect(created?.transparentProxy).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.transparentProxy);
  });

  it('leaves sessionTimeout, addressPool and rateLimit absent when omitted (they have no default)', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });

    const created = await client.findHotspotUserProfile({ name: 'perfil-1' });

    expect(created?.sessionTimeout).to.equal(undefined);
    expect(created?.addressPool).to.equal(undefined);
    expect(created?.rateLimit).to.equal(undefined);
  });

  it('stores explicitly provided values', async () => {
    await client.createHotspotUserProfile({
      addressPool: 'POOL-HOTSPOT',
      name: 'perfil-1',
      rateLimit: '5M/10M',
      sessionTimeout: '1h',
      sharedUsers: 'unlimited',
    });

    const created = await client.findHotspotUserProfile({ name: 'perfil-1' });

    expect(created?.addressPool).to.equal('POOL-HOTSPOT');
    expect(created?.rateLimit).to.equal('5M/10M');
    expect(created?.sessionTimeout).to.equal('1h');
    expect(created?.sharedUsers).to.equal('unlimited');
  });

  it('treats addressPool="none" as no pool at all, like RouterOS does', async () => {
    await client.createHotspotUserProfile({ addressPool: 'none', name: 'perfil-1' });

    expect((await client.findHotspotUserProfile({ name: 'perfil-1' }))?.addressPool).to.equal(undefined);
  });

  it('forces addMacCookie=true when macCookieTimeout is set on create (real RouterOS behaviour)', async () => {
    await client.createHotspotUserProfile({
      addMacCookie: false,
      macCookieTimeout: '3d',
      name: 'perfil-1',
    });

    // RouterOS 7.21.4 ignora el addMacCookie=false y activa la cookie, sin error.
    expect((await client.findHotspotUserProfile({ name: 'perfil-1' }))?.addMacCookie).to.equal(true);
  });

  it('respects addMacCookie=false when macCookieTimeout is not sent', async () => {
    await client.createHotspotUserProfile({ addMacCookie: false, name: 'perfil-1' });

    expect((await client.findHotspotUserProfile({ name: 'perfil-1' }))?.addMacCookie).to.equal(false);
  });

  it('forces addMacCookie=true when macCookieTimeout is set on update', async () => {
    await client.createHotspotUserProfile({ addMacCookie: false, name: 'perfil-1' });
    await client.updateHotspotUserProfile({ name: 'perfil-1' }, { addMacCookie: false, macCookieTimeout: '1d' });

    expect((await client.findHotspotUserProfile({ name: 'perfil-1' }))?.addMacCookie).to.equal(true);
  });

  it('never marks a created profile as the protected default', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });

    expect((await client.findHotspotUserProfile({ name: 'perfil-1' }))?.isDefault).to.equal(false);
  });

  it('rejects creating a duplicate profile name', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });

    await expect(client.createHotspotUserProfile({ name: 'perfil-1' })).rejects.toThrow(/already exists/);
  });

  it('finds by name and by id', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });
    const byName = await client.findHotspotUserProfile({ name: 'perfil-1' });

    expect(byName).to.not.equal(null);
    expect((await client.findHotspotUserProfile({ id: byName?.id ?? '' }))?.name).to.equal('perfil-1');
  });

  it('returns null for an unknown profile', async () => {
    expect(await client.findHotspotUserProfile({ name: 'nope' })).to.equal(null);
  });

  it('updates only the provided fields', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1', sessionTimeout: '1h' });
    await client.updateHotspotUserProfile({ name: 'perfil-1' }, { rateLimit: '2M/4M' });

    const updated = await client.findHotspotUserProfile({ name: 'perfil-1' });

    expect(updated?.rateLimit).to.equal('2M/4M');
    expect(updated?.sessionTimeout).to.equal('1h');
    expect(updated?.sharedUsers).to.equal(ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.sharedUsers);
  });

  it('is a no-op when updating a profile that does not exist', async () => {
    await client.updateHotspotUserProfile({ name: 'nope' }, { rateLimit: '1M/1M' });

    expect(await client.listHotspotUserProfiles()).to.have.length(0);
  });

  it('removes a profile and is idempotent on a second removal', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });

    await client.removeHotspotUserProfile({ name: 'perfil-1' });
    expect(await client.listHotspotUserProfiles()).to.have.length(0);

    await client.removeHotspotUserProfile({ name: 'perfil-1' });
    expect(await client.listHotspotUserProfiles()).to.have.length(0);
  });

  it('lists every profile', async () => {
    await client.createHotspotUserProfile({ name: 'perfil-1' });
    await client.createHotspotUserProfile({ name: 'perfil-2' });

    expect((await client.listHotspotUserProfiles()).map((p) => p.name).sort()).to.deep.equal([
      'perfil-1',
      'perfil-2',
    ]);
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(client.createHotspotUserProfile({ name: 'perfil-1' })).rejects.toThrow(/closed/);
    await expect(client.findHotspotUserProfile({ name: 'perfil-1' })).rejects.toThrow(/closed/);
    await expect(client.listHotspotUserProfiles()).rejects.toThrow(/closed/);
  });
});
