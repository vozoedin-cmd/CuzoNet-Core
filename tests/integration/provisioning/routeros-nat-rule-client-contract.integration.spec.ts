import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ObservedNatRule,
  RouterOsClientPort,
  RouterOsNatRuleCreateData,
} from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Contract tests entre los dos RouterOsClientPort de Firewall NAT.
 *
 * El doble es lo unico que ejercitan las pruebas del adapter, asi que cualquier punto en el
 * que sea mas permisivo o mas rico que el cliente real se convierte en un bug que la suite
 * en verde no detecta. Ya paso cuatro veces en este proyecto. Ambos clientes reciben el
 * MISMO estado de partida y se compara el contrato observable.
 */
describe('RouterOsClientPort contract for Firewall NAT (Fake vs Library)', () => {
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
  const SPEC: RouterOsNatRuleCreateData = {
    action: 'dst-nat',
    chain: 'dstnat',
    comment: 'cuzonet:firewall-nat:port-8080 reenvio web',
    dstPort: '8080',
    inInterface: 'ether1',
    protocol: 'tcp',
    toAddresses: '192.168.1.50',
    toPorts: '80',
  };

  const ROUTER_REPLY = {
    '.id': '*1',
    action: 'dst-nat',
    bytes: '0',
    chain: 'dstnat',
    comment: 'cuzonet:firewall-nat:port-8080 reenvio web',
    disabled: 'false',
    'dst-port': '8080',
    dynamic: 'false',
    'in-interface': 'ether1',
    invalid: 'false',
    packets: '0',
    protocol: 'tcp',
    'to-addresses': '192.168.1.50',
    'to-ports': '80',
  };

  /** El doble asigna ids propios; la identidad no forma parte del contrato comparado. */
  function comparableShape(rule: ObservedNatRule | null | undefined): unknown {
    if (rule === null || rule === undefined) return null;
    const { id: _id, ...rest } = rule;
    return rest;
  }

  describe('read shape parity', () => {
    it('listNatRules yields an identical ObservedNatRule from both clients', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createNatRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.listNatRules());
      const fromFake = await fake.listNatRules();

      expect(fromLibrary).toHaveLength(1);
      expect(fromFake).toHaveLength(1);
      expect(comparableShape(fromFake[0])).toEqual(comparableShape(fromLibrary[0]));
    });

    it('both derive the same ownership from the same comment', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createNatRule(SPEC);

      const fromLibrary = (await viaLibrary((client) => client.listNatRules()))[0];
      const fromFake = (await fake.listNatRules())[0];

      expect(fromFake?.ownership).toEqual(fromLibrary?.ownership);
      expect(fromFake?.ownership).toEqual({
        ruleReference: 'port-8080',
        status: 'valid',
        userComment: 'reenvio web',
      });
    });

    it('both expose the NAT-specific toAddresses and toPorts', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createNatRule(SPEC);

      const expected = { toAddresses: '192.168.1.50', toPorts: '80' };
      expect((await viaLibrary((client) => client.listNatRules()))[0]).toMatchObject(expected);
      expect((await fake.listNatRules())[0]).toMatchObject(expected);
    });

    it('both assign physicalIndex from the physical order of the listing', async () => {
      harness.existingRecords = [
        { ...ROUTER_REPLY, '.id': '*1' },
        { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-nat:second' },
      ];
      await fake.createNatRule(SPEC);
      await fake.createNatRule({ ...SPEC, comment: 'cuzonet:firewall-nat:second' });

      expect((await viaLibrary((client) => client.listNatRules())).map((r) => r.physicalIndex)).toEqual([0, 1]);
      expect((await fake.listNatRules()).map((r) => r.physicalIndex)).toEqual([0, 1]);
    });

    it('both omit the same optional properties for a bare rule', async () => {
      const bare = { action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:bare' };
      harness.existingRecords = [{ '.id': '*1', ...bare }];
      await fake.createNatRule(bare);

      const fromLibrary = (await viaLibrary((client) => client.listNatRules()))[0];
      const fromFake = (await fake.listNatRules())[0];

      expect(Object.keys(comparableShape(fromFake) as object).sort()).toEqual(
        Object.keys(comparableShape(fromLibrary) as object).sort(),
      );
    });

    it('both classify an unmanaged rule the same way and leave it unresolvable', async () => {
      const foreign = { action: 'masquerade', chain: 'srcnat', comment: 'puesta a mano' };
      harness.existingRecords = [{ '.id': '*1', ...foreign }];
      await fake.createNatRule(foreign);

      const fromLibrary = (await viaLibrary((client) => client.listNatRules()))[0];
      const fromFake = (await fake.listNatRules())[0];

      expect(fromLibrary?.ownership).toEqual({ status: 'unmanaged' });
      expect(fromFake?.ownership).toEqual({ status: 'unmanaged' });
      expect(await viaLibrary((client) => client.findNatRulesByReference('puesta a mano'))).toEqual([]);
      expect(await fake.findNatRulesByReference('puesta a mano')).toEqual([]);
    });

    it('both report an empty router as an empty list', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.listNatRules())).toEqual([]);
      expect(await fake.listNatRules()).toEqual([]);
    });
  });

  describe('lookup parity', () => {
    it('findNatRulesByReference returns the same shape from both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createNatRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.findNatRulesByReference('port-8080'));
      const fromFake = await fake.findNatRulesByReference('port-8080');

      expect(comparableShape(fromFake[0])).toEqual(comparableShape(fromLibrary[0]));
    });

    it('findNatRulesByReference returns every match, not just the first, in both', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createNatRule(SPEC);
      await fake.createNatRule(SPEC);

      expect(await viaLibrary((client) => client.findNatRulesByReference('port-8080'))).toHaveLength(2);
      expect(await fake.findNatRulesByReference('port-8080')).toHaveLength(2);
    });

    it('findNatRulesByReference yields an empty array in both when nothing matches', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createNatRule(SPEC);

      expect(await viaLibrary((client) => client.findNatRulesByReference('nope'))).toEqual([]);
      expect(await fake.findNatRulesByReference('nope')).toEqual([]);
    });

    it('findNatRuleById yields null in both when the id is unknown', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.findNatRuleById('*99'))).toBeNull();
      expect(await fake.findNatRuleById('*99')).toBeNull();
    });

    it('findNatRuleById omits physicalIndex in both clients', async () => {
      await fake.createNatRule({ ...SPEC, comment: 'cuzonet:firewall-nat:first' });
      await fake.createNatRule(SPEC);
      const second = fake.natRules[1];
      harness.existingRecord = { ...ROUTER_REPLY, '.id': second?.id ?? '*2' };

      const fromFake = await fake.findNatRuleById(second?.id ?? '*2');
      const fromLibrary = await viaLibrary((client) => client.findNatRuleById(second?.id ?? '*2'));

      expect(fromFake).not.toHaveProperty('physicalIndex');
      expect(fromLibrary).not.toHaveProperty('physicalIndex');
      expect(comparableShape(fromFake)).toEqual(comparableShape(fromLibrary));
    });
  });

  describe('mutation parity', () => {
    const MUTATIONS = ['enableNatRule', 'disableNatRule', 'removeNatRule'] as const;

    it.each(MUTATIONS)('%s is a silent no-op in both when the rule is missing', async (method) => {
      harness.existingRecords = [];

      await expect(viaLibrary((client) => client[method]({ id: '*99', kind: 'id' }))).resolves.toBeUndefined();
      await expect(fake[method]({ id: '*99', kind: 'id' })).resolves.toBeUndefined();
    });

    it('updateNatRule and moveNatRule are silent no-ops in both when the rule is missing', async () => {
      harness.existingRecords = [];

      await expect(
        viaLibrary((client) => client.updateNatRule({ id: '*99', kind: 'id' }, { toPorts: '80' })),
      ).resolves.toBeUndefined();
      await expect(fake.updateNatRule({ id: '*99', kind: 'id' }, { toPorts: '80' })).resolves.toBeUndefined();
      await expect(
        viaLibrary((client) => client.moveNatRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })),
      ).resolves.toBeUndefined();
      await expect(fake.moveNatRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })).resolves.toBeUndefined();
    });

    it('both resolve a managed-reference locator to the first match', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createNatRule(SPEC);
      await fake.createNatRule(SPEC);

      await viaLibrary((client) =>
        client.removeNatRule({ kind: 'managed-reference', ruleReference: 'port-8080' }),
      );
      await fake.removeNatRule({ kind: 'managed-reference', ruleReference: 'port-8080' });

      expect(harness.captured.find((e) => e.command.endsWith('/remove'))?.attributes.numbers).toBe('*1');
      expect(fake.natRules).toHaveLength(1);
    });
  });
});
