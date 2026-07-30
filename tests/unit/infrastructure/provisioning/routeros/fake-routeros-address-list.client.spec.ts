import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient address list entries', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('creates an entry with defaults applied', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    expect(client.addressListEntries).to.have.length(1);
    expect(client.addressListEntries[0]).to.include({ address: '192.168.1.10', disabled: false, list: 'blocked-ips' });
    expect(client.addressListEntries[0]?.id).to.match(/^\*\d+$/);
  });

  it('creates a static entry: nothing CuzoNet can send makes it dynamic', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    expect(client.addressListEntries[0]?.dynamic).to.equal(false);
  });

  it('omits comment entirely when none is given, like RouterOS does', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    expect(client.addressListEntries[0]).not.to.have.property('comment');
  });

  /**
   * Comportamientos verificados contra un hEX con RouterOS 7.21.4. El doble los replica
   * porque son justo los que ninguna prueba podia alcanzar antes: el fake aceptaba
   * duplicados y deshabilitaba entradas dinamicas, cosas que el router real rechaza.
   */
  describe('real RouterOS behaviour', () => {
    it('rejects a duplicate list+address on add', async () => {
      await client.createAddressListEntry({ address: '192.168.1.10', comment: 'primera', list: 'blocked-ips' });

      await expect(
        client.createAddressListEntry({ address: '192.168.1.10', comment: 'segunda', list: 'blocked-ips' }),
      ).rejects.toThrow('already have such entry');

      // Ni actualiza la existente ni crea una segunda.
      expect(client.addressListEntries).to.have.length(1);
      expect(client.addressListEntries[0]?.comment).to.equal('primera');
    });

    it('refuses to disable a dynamic entry', async () => {
      client.addressListEntries.push({
        address: '192.168.1.198',
        disabled: false,
        dynamic: true,
        id: '*10',
        list: 'blocked-ips',
      });

      await expect(client.disableAddressListEntry({ id: '*10' })).rejects.toThrow(
        'cannot have disabled dynamic entry',
      );
      await expect(client.updateAddressListEntry({ id: '*10' }, { disabled: true })).rejects.toThrow(
        'cannot have disabled dynamic entry',
      );
      expect(client.addressListEntries[0]?.disabled).to.equal(false);
    });

    it('accepts set and remove on a dynamic entry, as the router does', async () => {
      client.addressListEntries.push({
        address: '192.168.1.198',
        disabled: false,
        dynamic: true,
        id: '*10',
        list: 'blocked-ips',
      });

      await client.updateAddressListEntry({ id: '*10' }, { comment: 'tocada' });
      expect(client.addressListEntries[0]?.comment).to.equal('tocada');

      await client.removeAddressListEntry({ id: '*10' });
      expect(client.addressListEntries).to.have.length(0);
    });
  });

  it('finds an entry by list+address and by id', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    const created = client.addressListEntries[0]!;

    expect(await client.findAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' })).to.include({
      id: created.id,
    });
    expect(await client.findAddressListEntry({ id: created.id })).to.include({ address: '192.168.1.10' });
    expect(await client.findAddressListEntry({ address: '192.168.1.10', list: 'other-list' })).to.equal(null);
  });

  it('enables and disables an entry', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    await client.disableAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    expect(client.addressListEntries[0]?.disabled).to.equal(true);

    await client.enableAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    expect(client.addressListEntries[0]?.disabled).to.equal(false);
  });

  it('no-ops enable/disable/remove/update when the entry does not exist', async () => {
    const missing = { address: '10.0.0.1', list: 'missing-list' };
    await expect(client.disableAddressListEntry(missing)).resolves.toBeUndefined();
    await expect(client.enableAddressListEntry(missing)).resolves.toBeUndefined();
    await expect(client.removeAddressListEntry(missing)).resolves.toBeUndefined();
    await expect(client.updateAddressListEntry(missing, { comment: 'x' })).resolves.toBeUndefined();
  });

  it('updates only the provided fields', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    await client.updateAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' }, { comment: 'moroso' });

    expect(client.addressListEntries[0]).to.include({ address: '192.168.1.10', comment: 'moroso', list: 'blocked-ips' });
  });

  it('removes an entry', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    await client.removeAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    expect(client.addressListEntries).to.have.length(0);
  });

  it('does not confuse the same address across different lists', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'trusted-ips' });

    expect(client.addressListEntries).to.have.length(2);
    await client.removeAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    expect(client.addressListEntries).to.have.length(1);
    expect(client.addressListEntries[0]?.list).to.equal('trusted-ips');
  });

  it('lists every created entry', async () => {
    await client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    await client.createAddressListEntry({ address: '192.168.1.11', list: 'trusted-ips' });

    const listed = await client.listAddressListEntries();

    expect(listed.map((e) => `${e.list}:${e.address}`)).to.deep.equal(['blocked-ips:192.168.1.10', 'trusted-ips:192.168.1.11']);
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(client.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' })).rejects.toThrow(
      'Client is closed',
    );
    await expect(client.findAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' })).rejects.toThrow(
      'Client is closed',
    );
    await expect(client.listAddressListEntries()).rejects.toThrow('Client is closed');
  });
});
