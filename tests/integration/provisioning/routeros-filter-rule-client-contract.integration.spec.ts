import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ObservedFilterRule,
  RouterOsClientPort,
  RouterOsFilterRuleCreateData,
} from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Contract tests entre los dos RouterOsClientPort de Firewall Filter.
 *
 * El doble es lo unico que ejercitan las pruebas del adapter, asi que cualquier punto en
 * el que sea mas permisivo que el cliente real se convierte en un bug que ~1100 pruebas en
 * verde no detectan. Ya paso tres veces en este proyecto (Simple Queue, PPPoE, Hotspot).
 * Estas pruebas someten a ambos al MISMO estado de partida y comparan el contrato
 * observable: la forma de ObservedFilterRule y el comportamiento ante ausencia.
 */
describe('RouterOsClientPort contract for Firewall Filter (Fake vs Library)', () => {
  let harness: FakeRouterOsServer;
  let fake: FakeRouterOsClient;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
    fake = new FakeRouterOsClient();
  });

  afterEach(async () => {
    await harness.stop();
  });

  async function viaLibrary<T>(run: (client: RouterOsClientPort) => Promise<T>): Promise<T> {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      return await run(client);
    } finally {
      await client.close();
    }
  }

  /** Una regla administrada, expresada a la vez como create-data y como respuesta del router. */
  const SPEC: RouterOsFilterRuleCreateData = {
    action: 'drop',
    chain: 'input',
    comment: 'cuzonet:firewall-filter:block-ssh-wan bloqueo SSH',
    connectionState: 'new',
    dstPort: '22',
    inInterface: 'ether1',
    protocol: 'tcp',
    srcAddress: '192.168.1.0/24',
  };

  const ROUTER_REPLY = {
    '.id': '*1',
    action: 'drop',
    bytes: '0',
    chain: 'input',
    comment: 'cuzonet:firewall-filter:block-ssh-wan bloqueo SSH',
    'connection-state': 'new',
    disabled: 'false',
    'dst-port': '22',
    dynamic: 'false',
    'in-interface': 'ether1',
    invalid: 'false',
    log: 'false',
    packets: '0',
    protocol: 'tcp',
    'src-address': '192.168.1.0/24',
  };

  /** El doble asigna ids propios; la identidad no forma parte del contrato comparado. */
  function comparableShape(rule: ObservedFilterRule | null): unknown {
    if (rule === null) return null;
    const { id: _id, ...rest } = rule;
    return rest;
  }

  describe('read shape parity', () => {
    it('listFilterRules yields an identical ObservedFilterRule from both clients', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createFilterRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.listFilterRules());
      const fromFake = await fake.listFilterRules();

      expect(fromLibrary).toHaveLength(1);
      expect(fromFake).toHaveLength(1);
      expect(comparableShape(fromFake[0] ?? null)).toEqual(comparableShape(fromLibrary[0] ?? null));
    });

    it('both derive the same ownership from the same comment', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createFilterRule(SPEC);

      const fromLibrary = (await viaLibrary((client) => client.listFilterRules()))[0];
      const fromFake = (await fake.listFilterRules())[0];

      expect(fromFake?.ownership).toEqual(fromLibrary?.ownership);
      expect(fromFake?.ownership.ruleReference).toBe('block-ssh-wan');
    });

    it('both assign physicalIndex from the physical order of the listing', async () => {
      harness.existingRecords = [
        { ...ROUTER_REPLY, '.id': '*1' },
        { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-filter:second' },
      ];
      await fake.createFilterRule(SPEC);
      await fake.createFilterRule({ ...SPEC, comment: 'cuzonet:firewall-filter:second' });

      const fromLibrary = await viaLibrary((client) => client.listFilterRules());
      const fromFake = await fake.listFilterRules();

      expect(fromLibrary.map((rule) => rule.physicalIndex)).toEqual([0, 1]);
      expect(fromFake.map((rule) => rule.physicalIndex)).toEqual([0, 1]);
    });

    /** Regresion: el doble almacenaba srcAddress/dstAddress pero no los devolvia. */
    it('both expose srcAddress and dstAddress when the rule carries them', async () => {
      harness.existingRecords = [{ ...ROUTER_REPLY, 'dst-address': '10.0.0.0/8' }];
      await fake.createFilterRule({ ...SPEC, dstAddress: '10.0.0.0/8' });

      const fromLibrary = (await viaLibrary((client) => client.listFilterRules()))[0];
      const fromFake = (await fake.listFilterRules())[0];

      const expected = { dstAddress: '10.0.0.0/8', srcAddress: '192.168.1.0/24' };
      expect(fromLibrary).toMatchObject(expected);
      expect(fromFake).toMatchObject(expected);
    });

    it('both omit srcAddress and dstAddress when the rule has neither', async () => {
      const bare = { action: 'accept', chain: 'forward', comment: 'cuzonet:firewall-filter:bare' };
      harness.existingRecords = [{ '.id': '*1', ...bare }];
      await fake.createFilterRule(bare);

      const fromLibrary = (await viaLibrary((client) => client.listFilterRules()))[0];
      const fromFake = (await fake.listFilterRules())[0];

      for (const rule of [fromLibrary, fromFake]) {
        expect(rule).not.toHaveProperty('srcAddress');
        expect(rule).not.toHaveProperty('dstAddress');
      }
    });

    it('both omit the same optional properties for a bare rule', async () => {
      const bare = { action: 'accept', chain: 'forward', comment: 'cuzonet:firewall-filter:bare' };
      harness.existingRecords = [{ '.id': '*1', ...bare }];
      await fake.createFilterRule(bare);

      const fromLibrary = (await viaLibrary((client) => client.listFilterRules()))[0];
      const fromFake = (await fake.listFilterRules())[0];

      expect(Object.keys(comparableShape(fromFake ?? null) as object).sort()).toEqual(
        Object.keys(comparableShape(fromLibrary ?? null) as object).sort(),
      );
    });

    it('both report an empty router as an empty list', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.listFilterRules())).toEqual([]);
      expect(await fake.listFilterRules()).toEqual([]);
    });
  });

  describe('lookup parity', () => {
    it('findFilterRulesByReference returns the same shape from both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createFilterRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.findFilterRulesByReference('block-ssh-wan'));
      const fromFake = await fake.findFilterRulesByReference('block-ssh-wan');

      expect(comparableShape(fromFake[0] ?? null)).toEqual(comparableShape(fromLibrary[0] ?? null));
    });

    it('findFilterRulesByReference returns every match, not just the first, in both', async () => {
      const duplicated = { ...ROUTER_REPLY, '.id': '*2' };
      harness.existingRecords = [ROUTER_REPLY, duplicated];
      await fake.createFilterRule(SPEC);
      await fake.createFilterRule(SPEC);

      expect(await viaLibrary((client) => client.findFilterRulesByReference('block-ssh-wan'))).toHaveLength(2);
      expect(await fake.findFilterRulesByReference('block-ssh-wan')).toHaveLength(2);
    });

    it('findFilterRulesByReference yields an empty array in both when nothing matches', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createFilterRule(SPEC);

      expect(await viaLibrary((client) => client.findFilterRulesByReference('nope'))).toEqual([]);
      expect(await fake.findFilterRulesByReference('nope')).toEqual([]);
    });

    it('findFilterRuleById yields null in both when the id is unknown', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.findFilterRuleById('*99'))).toBeNull();
      expect(await fake.findFilterRuleById('*99')).toBeNull();
    });
  });

  describe('mutation parity', () => {
    const MUTATIONS = ['enableFilterRule', 'disableFilterRule', 'removeFilterRule'] as const;

    it.each(MUTATIONS)('%s is a silent no-op in both when the rule is missing', async (method) => {
      harness.existingRecords = [];

      await expect(viaLibrary((client) => client[method]({ id: '*99', kind: 'id' }))).resolves.toBeUndefined();
      await expect(fake[method]({ id: '*99', kind: 'id' })).resolves.toBeUndefined();
    });

    it('updateFilterRule is a silent no-op in both when the rule is missing', async () => {
      harness.existingRecords = [];

      await expect(
        viaLibrary((client) => client.updateFilterRule({ id: '*99', kind: 'id' }, { protocol: 'udp' })),
      ).resolves.toBeUndefined();
      await expect(
        fake.updateFilterRule({ id: '*99', kind: 'id' }, { protocol: 'udp' }),
      ).resolves.toBeUndefined();
    });

    it('moveFilterRule is a silent no-op in both when the rule is missing', async () => {
      harness.existingRecords = [];

      await expect(
        viaLibrary((client) => client.moveFilterRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })),
      ).resolves.toBeUndefined();
      await expect(
        fake.moveFilterRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' }),
      ).resolves.toBeUndefined();
    });

    it('both resolve a managed-reference locator to the first match', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createFilterRule(SPEC);
      await fake.createFilterRule(SPEC);

      await viaLibrary((client) =>
        client.removeFilterRule({ kind: 'managed-reference', ruleReference: 'block-ssh-wan' }),
      );
      await fake.removeFilterRule({ kind: 'managed-reference', ruleReference: 'block-ssh-wan' });

      const removeCommand = harness.captured.find((entry) => entry.command.endsWith('/remove'));
      expect(removeCommand?.attributes.numbers).toBe('*1');
      expect(fake.filterRules.map((rule) => rule.id)).toHaveLength(1);
    });
  });

  /** Campos extendidos y semantica de `physicalIndex`, identicos en ambos clientes. */
  describe('extended fields and positional metadata', () => {
    const EXTENDED_FIELDS = {
      addressList: 'MOROSOS',
      hotspot: 'auth',
      jumpTarget: 'custom-chain',
      log: true,
      logPrefix: 'CUZONET',
      rejectWith: 'icmp-net-unreachable',
    } as const;

    it('both honour jumpTarget/rejectWith/hotspot/log/logPrefix/addressList', async () => {
      await fake.createFilterRule({ ...SPEC, ...EXTENDED_FIELDS });
      await viaLibrary((client) => client.createFilterRule({ ...SPEC, ...EXTENDED_FIELDS }));

      // El doble los conserva...
      expect((await fake.listFilterRules())[0]).toMatchObject(EXTENDED_FIELDS);

      // ...y el cliente real los pone en el cable con los nombres de RouterOS.
      const add = harness.captured.find((entry) => entry.command.endsWith('/add'));
      expect(add?.attributes).toMatchObject({
        'address-list': 'MOROSOS',
        hotspot: 'auth',
        'jump-target': 'custom-chain',
        log: 'yes',
        'log-prefix': 'CUZONET',
        'reject-with': 'icmp-net-unreachable',
      });
    });

    it('a rule carrying the extended fields round-trips to the same observed shape in both', async () => {
      harness.existingRecords = [
        {
          ...ROUTER_REPLY,
          'address-list': 'MOROSOS',
          hotspot: 'auth',
          'jump-target': 'custom-chain',
          log: 'true',
          'log-prefix': 'CUZONET',
          'reject-with': 'icmp-net-unreachable',
        },
      ];
      await fake.createFilterRule({ ...SPEC, ...EXTENDED_FIELDS });

      const fromLibrary = (await viaLibrary((client) => client.listFilterRules()))[0];
      const fromFake = (await fake.listFilterRules())[0];

      expect(comparableShape(fromFake ?? null)).toEqual(comparableShape(fromLibrary ?? null));
    });

    it('findFilterRuleById omits physicalIndex in both clients', async () => {
      await fake.createFilterRule({ ...SPEC, comment: 'cuzonet:firewall-filter:first' });
      await fake.createFilterRule(SPEC);
      const second = fake.filterRules[1];
      harness.existingRecord = { ...ROUTER_REPLY, '.id': second?.id ?? '*2' };

      const fromFake = await fake.findFilterRuleById(second?.id ?? '*2');
      const fromLibrary = await viaLibrary((client) => client.findFilterRuleById(second?.id ?? '*2'));

      // El doble conoce la posicion real, pero la omite igual que el cliente real: la
      // paridad del contrato pesa mas que el dato extra.
      expect(fromFake).not.toHaveProperty('physicalIndex');
      expect(fromLibrary).not.toHaveProperty('physicalIndex');
      expect(comparableShape(fromFake)).toEqual(comparableShape(fromLibrary));
    });
  });
});
