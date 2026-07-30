import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Wire-protocol coverage for /ip/firewall/address-list against real RouterOS binary
 * framing. This resource had none until now, which is why its mapper drifted: the fake
 * client was the only thing exercising it, and it was more permissive than the router.
 *
 * The reference record below is a verbatim reply captured from a hEX running RouterOS
 * 7.21.4, including the details that matter: booleans arrive as "true"/"false", and a
 * permanent entry carries no `timeout` key at all.
 */
describe('LibraryRouterOsClient wire protocol (Firewall Address List)', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  /** Capturado de /ip/firewall/address-list/print en el router de laboratorio. */
  const existingStatic = {
    '.id': '*1',
    address: '192.168.10.255',
    comment: 'X/31/2023 19:28 Router Cesar',
    'creation-time': '2023-10-10 07:22:26',
    disabled: 'true',
    dynamic: 'false',
    list: 'MOROSOS',
  };

  async function withClient<T>(run: (client: LibraryRouterOsClient) => Promise<T>): Promise<T> {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      return await run(client);
    } finally {
      await client.close();
    }
  }

  describe('commands sent', () => {
    it('findAddressListEntry sends /print once, with ?list= and ?address= and no duplicated suffix', async () => {
      await withClient((client) =>
        client.findAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' }),
      );

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/address-list/print');
      expect(harness.captured[0]?.queries).toEqual(['?list=MOROSOS', '?address=192.168.10.255']);
    });

    it('findAddressListEntry prefers ?.id= when an id is given', async () => {
      await withClient((client) => client.findAddressListEntry({ id: '*1' }));

      expect(harness.captured[0]?.queries).toEqual(['?.id=*1']);
    });

    it('asks for creation-time and dynamic, and never for timeout', async () => {
      await withClient(async (client) => {
        await client.findAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' });
        await client.listAddressListEntries();
      });

      expect(harness.captured).toHaveLength(2);
      for (const entry of harness.captured) {
        const proplist = entry.attributes['.proplist'] ?? '';
        expect(proplist.split(',')).toEqual([
          '.id',
          'list',
          'address',
          'disabled',
          'comment',
          'creation-time',
          'dynamic',
        ]);
        expect(proplist).not.toContain('timeout');
      }
    });

    it('createAddressListEntry sends /add without any timeout attribute', async () => {
      await withClient((client) =>
        client.createAddressListEntry({
          address: '203.0.113.1',
          comment: 'moroso',
          disabled: false,
          list: 'MOROSOS',
        }),
      );

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/address-list/add');
      expect(harness.captured[0]?.attributes).toEqual({
        address: '203.0.113.1',
        comment: 'moroso',
        disabled: 'no',
        list: 'MOROSOS',
      });
    });

    it('updateAddressListEntry sends /set with =numbers= and no timeout attribute', async () => {
      harness.existingRecord = existingStatic;

      await withClient((client) =>
        client.updateAddressListEntry({ id: '*1' }, { comment: 'actualizado', disabled: false }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.command).toBe('/ip/firewall/address-list/set');
      expect(set?.attributes).toEqual({ comment: 'actualizado', disabled: 'no', numbers: '*1' });
    });

    it('removeAddressListEntry sends /remove with the resolved =numbers=', async () => {
      harness.existingRecord = existingStatic;

      await withClient((client) => client.removeAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' }));

      const remove = harness.captured.find((entry) => entry.command.endsWith('/remove'));
      expect(remove?.command).toBe('/ip/firewall/address-list/remove');
      expect(remove?.attributes).toEqual({ numbers: '*1' });
    });

    /**
     * Cuando el `.id` ya viene resuelto —el caso normal, porque el adapter localiza la
     * entrada antes de decidir qué hacer— la mutación no vuelve a consultar al router.
     * Antes cada una costaba dos viajes.
     */
    it('mutating by id sends exactly one command, with no lookup round trip', async () => {
      harness.existingRecord = existingStatic;

      await withClient(async (client) => {
        await client.updateAddressListEntry({ id: '*1' }, { comment: 'x' });
        await client.enableAddressListEntry({ id: '*1' });
        await client.disableAddressListEntry({ id: '*1' });
        await client.removeAddressListEntry({ id: '*1' });
      });

      expect(harness.captured.map((entry) => entry.command)).toEqual([
        '/ip/firewall/address-list/set',
        '/ip/firewall/address-list/enable',
        '/ip/firewall/address-list/disable',
        '/ip/firewall/address-list/remove',
      ]);
    });

    it('still resolves by list+address when no id is given', async () => {
      harness.existingRecord = existingStatic;

      await withClient((client) =>
        client.enableAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' }),
      );

      expect(harness.captured.map((entry) => entry.command)).toEqual([
        '/ip/firewall/address-list/print',
        '/ip/firewall/address-list/enable',
      ]);
    });

    it('never emits a duplicated /print/print for any address-list operation', async () => {
      harness.existingRecord = existingStatic;

      await withClient(async (client) => {
        await client.findAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' });
        await client.listAddressListEntries();
        await client.enableAddressListEntry({ id: '*1' });
        await client.disableAddressListEntry({ id: '*1' });
      });

      for (const entry of harness.captured) {
        expect(entry.command).not.toContain('/print/print');
      }
    });
  });

  describe('replies mapped', () => {
    it('maps every property RouterOS 7.21.4 returns for a static entry', async () => {
      harness.existingRecord = existingStatic;

      const entry = await withClient((client) =>
        client.findAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' }),
      );

      expect(entry).toEqual({
        address: '192.168.10.255',
        comment: 'X/31/2023 19:28 Router Cesar',
        creationTime: '2023-10-10 07:22:26',
        disabled: true,
        dynamic: false,
        id: '*1',
        list: 'MOROSOS',
      });
    });

    it('maps a dynamic entry generated by a firewall rule', async () => {
      // Capturado tras un add-src-to-address-list: sin comment, con timeout en cuenta
      // regresiva, que el contrato ignora deliberadamente.
      harness.existingRecord = {
        '.id': '*10',
        address: '192.168.1.198',
        'creation-time': '2026-07-30 08:24:31',
        disabled: 'false',
        dynamic: 'true',
        list: 'CUZONET_PROBE',
        timeout: '1m56s',
      };

      const entry = await withClient((client) => client.findAddressListEntry({ id: '*10' }));

      expect(entry?.dynamic).toBe(true);
      expect(entry?.disabled).toBe(false);
      expect(entry).not.toHaveProperty('timeout');
      expect(entry).not.toHaveProperty('comment');
    });

    it('keeps an absent comment absent instead of flattening it to an empty string', async () => {
      harness.existingRecord = {
        '.id': '*2',
        address: '203.0.113.1',
        'creation-time': '2026-07-30 08:21:14',
        disabled: 'false',
        dynamic: 'false',
        list: 'MOROSOS',
      };

      const entry = await withClient((client) => client.findAddressListEntry({ id: '*2' }));

      expect(entry).not.toHaveProperty('comment');
      expect(entry).not.toHaveProperty('timeout');
    });

    it('accepts the legacy yes/no boolean form as well as true/false', async () => {
      harness.existingRecord = {
        '.id': '*3',
        address: '203.0.113.2',
        disabled: 'yes',
        dynamic: 'yes',
        list: 'MOROSOS',
      };

      const entry = await withClient((client) => client.findAddressListEntry({ id: '*3' }));

      expect(entry?.disabled).toBe(true);
      expect(entry?.dynamic).toBe(true);
    });

    /**
     * El arnés responde con un único `!re`, así que aquí se comprueba el contrato de la
     * forma plural: `findAddressListEntries` devuelve una colección y `findAddressListEntry`
     * se queda con la primera. La cobertura del duplicado real (dos filas) vive en el spec
     * del adapter, que es quien debe negarse a operar.
     */
    it('findAddressListEntries returns a collection, findAddressListEntry the first match', async () => {
      harness.existingRecord = existingStatic;

      const { many, one } = await withClient(async (client) => ({
        many: await client.findAddressListEntries({ address: '192.168.10.255', list: 'MOROSOS' }),
        one: await client.findAddressListEntry({ address: '192.168.10.255', list: 'MOROSOS' }),
      }));

      expect(many).toHaveLength(1);
      expect(many[0]).toEqual(one);
    });

    it('findAddressListEntries returns an empty array for an unusable reference', async () => {
      const entries = await withClient((client) => client.findAddressListEntries({ list: 'MOROSOS' }));

      expect(entries).toEqual([]);
      expect(harness.captured).toHaveLength(0);
    });

    it('treats an absent boolean as false', async () => {
      harness.existingRecord = { '.id': '*4', address: '203.0.113.3', list: 'MOROSOS' };

      const entry = await withClient((client) => client.findAddressListEntry({ id: '*4' }));

      expect(entry?.disabled).toBe(false);
      expect(entry?.dynamic).toBe(false);
    });
  });
});
