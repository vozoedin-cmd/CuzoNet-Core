import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ObservedMangleRule,
  RouterOsClientPort,
  RouterOsMangleRuleCreateData,
} from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Contract tests entre los dos RouterOsClientPort de Firewall Mangle.
 *
 * El doble es lo unico que ejercitan las pruebas del adapter, asi que cualquier punto en el
 * que sea mas permisivo o mas rico que el cliente real se convierte en un bug que la suite
 * en verde no detecta. En este recurso el riesgo es concreto y ya demostrado: mientras el
 * doble omitia `passthrough`, el defecto de idempotencia era invisible.
 */
describe('RouterOsClientPort contract for Firewall Mangle (Fake vs Library)', () => {
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
  const SPEC: RouterOsMangleRuleCreateData = {
    action: 'mark-connection',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-mangle:marca-voip prioridad',
    newConnectionMark: 'voip-conn',
    protocol: 'udp',
  };

  const ROUTER_REPLY = {
    '.id': '*1',
    action: 'mark-connection',
    bytes: '0',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-mangle:marca-voip prioridad',
    disabled: 'false',
    dynamic: 'false',
    invalid: 'false',
    'new-connection-mark': 'voip-conn',
    packets: '0',
    // El router materializa siempre passthrough; el doble hace lo mismo.
    passthrough: 'true',
    protocol: 'udp',
  };

  /** El doble asigna ids propios; la identidad no forma parte del contrato comparado. */
  function comparableShape(rule: ObservedMangleRule | null | undefined): unknown {
    if (rule === null || rule === undefined) return null;
    const { id: _id, ...rest } = rule;
    return rest;
  }

  describe('read shape parity', () => {
    it('listMangleRules yields an identical ObservedMangleRule from both clients', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.listMangleRules());
      const fromFake = await fake.listMangleRules();

      expect(fromLibrary).toHaveLength(1);
      expect(fromFake).toHaveLength(1);
      expect(comparableShape(fromFake[0])).toEqual(comparableShape(fromLibrary[0]));
    });

    /** La divergencia que ocultaba el defecto de idempotencia. */
    it('both materialise passthrough when the caller omits it', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      expect((await viaLibrary((client) => client.listMangleRules()))[0]?.passthrough)
        .toBe(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough);
      expect((await fake.listMangleRules())[0]?.passthrough)
        .toBe(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough);
    });

    it('both report an explicit passthrough=false identically', async () => {
      harness.existingRecords = [{ ...ROUTER_REPLY, passthrough: 'false' }];
      await fake.createMangleRule({ ...SPEC, passthrough: false });

      expect((await viaLibrary((client) => client.listMangleRules()))[0]?.passthrough).toBe(false);
      expect((await fake.listMangleRules())[0]?.passthrough).toBe(false);
    });

    it('both derive the same ownership from the same comment', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      const fromLibrary = (await viaLibrary((client) => client.listMangleRules()))[0];
      const fromFake = (await fake.listMangleRules())[0];

      expect(fromFake?.ownership).toEqual(fromLibrary?.ownership);
      expect(fromFake?.ownership).toEqual({
        ruleReference: 'marca-voip',
        status: 'valid',
        userComment: 'prioridad',
      });
    });

    it('both expose the mangle-specific mark fields', async () => {
      const marks = {
        connectionMark: 'CM', newPacketMark: 'NPM', newRoutingMark: 'main',
        packetMark: 'PM', routingMark: 'RM',
      };
      harness.existingRecords = [{
        ...ROUTER_REPLY, 'connection-mark': 'CM', 'new-packet-mark': 'NPM',
        'new-routing-mark': 'main', 'packet-mark': 'PM', 'routing-mark': 'RM',
      }];
      await fake.createMangleRule({ ...SPEC, ...marks });

      expect((await viaLibrary((client) => client.listMangleRules()))[0]).toMatchObject(marks);
      expect((await fake.listMangleRules())[0]).toMatchObject(marks);
    });

    it('both assign physicalIndex from the physical order of the listing', async () => {
      harness.existingRecords = [
        { ...ROUTER_REPLY, '.id': '*1' },
        { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-mangle:second' },
      ];
      await fake.createMangleRule(SPEC);
      await fake.createMangleRule({ ...SPEC, comment: 'cuzonet:firewall-mangle:second' });

      expect((await viaLibrary((client) => client.listMangleRules())).map((r) => r.physicalIndex)).toEqual([0, 1]);
      expect((await fake.listMangleRules()).map((r) => r.physicalIndex)).toEqual([0, 1]);
    });

    it('both omit the same optional properties for a bare rule', async () => {
      const bare = { action: 'mark-packet', chain: 'forward', comment: 'cuzonet:firewall-mangle:bare', newPacketMark: 'p' };
      harness.existingRecords = [{ '.id': '*1', action: 'mark-packet', chain: 'forward', comment: bare.comment, 'new-packet-mark': 'p', passthrough: 'true' }];
      await fake.createMangleRule(bare);

      const fromLibrary = (await viaLibrary((client) => client.listMangleRules()))[0];
      const fromFake = (await fake.listMangleRules())[0];

      expect(Object.keys(comparableShape(fromFake) as object).sort()).toEqual(
        Object.keys(comparableShape(fromLibrary) as object).sort(),
      );
    });

    it('both classify an unmanaged rule the same way and leave it unresolvable', async () => {
      const foreign = { action: 'mark-packet', chain: 'forward', comment: 'puesta a mano', newPacketMark: 'p' };
      harness.existingRecords = [{ '.id': '*1', action: 'mark-packet', chain: 'forward', comment: 'puesta a mano', 'new-packet-mark': 'p', passthrough: 'true' }];
      await fake.createMangleRule(foreign);

      expect((await viaLibrary((client) => client.listMangleRules()))[0]?.ownership).toEqual({ status: 'unmanaged' });
      expect((await fake.listMangleRules())[0]?.ownership).toEqual({ status: 'unmanaged' });
      expect(await viaLibrary((client) => client.findMangleRulesByReference('puesta a mano'))).toEqual([]);
      expect(await fake.findMangleRulesByReference('puesta a mano')).toEqual([]);
    });

    it('both report an empty router as an empty list', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.listMangleRules())).toEqual([]);
      expect(await fake.listMangleRules()).toEqual([]);
    });
  });

  describe('lookup parity', () => {
    it('findMangleRulesByReference returns the same shape from both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      expect(comparableShape((await fake.findMangleRulesByReference('marca-voip'))[0])).toEqual(
        comparableShape((await viaLibrary((client) => client.findMangleRulesByReference('marca-voip')))[0]),
      );
    });

    it('findMangleRulesByReference returns every match, not just the first, in both', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createMangleRule(SPEC);
      await fake.createMangleRule(SPEC);

      expect(await viaLibrary((client) => client.findMangleRulesByReference('marca-voip'))).toHaveLength(2);
      expect(await fake.findMangleRulesByReference('marca-voip')).toHaveLength(2);
    });

    it('findMangleRulesByReference yields an empty array in both when nothing matches', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      expect(await viaLibrary((client) => client.findMangleRulesByReference('nope'))).toEqual([]);
      expect(await fake.findMangleRulesByReference('nope')).toEqual([]);
    });

    it('findMangleRuleById yields null in both when the id is unknown', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.findMangleRuleById('*99'))).toBeNull();
      expect(await fake.findMangleRuleById('*99')).toBeNull();
    });

    it('findMangleRuleById omits physicalIndex in both clients', async () => {
      await fake.createMangleRule({ ...SPEC, comment: 'cuzonet:firewall-mangle:first' });
      await fake.createMangleRule(SPEC);
      const second = fake.mangleRules[1];
      harness.existingRecord = { ...ROUTER_REPLY, '.id': second?.id ?? '*2' };

      const fromFake = await fake.findMangleRuleById(second?.id ?? '*2');
      const fromLibrary = await viaLibrary((client) => client.findMangleRuleById(second?.id ?? '*2'));

      expect(fromFake).not.toHaveProperty('physicalIndex');
      expect(fromLibrary).not.toHaveProperty('physicalIndex');
      expect(comparableShape(fromFake)).toEqual(comparableShape(fromLibrary));
    });
  });

  describe('mutation parity', () => {
    const MUTATIONS = ['enableMangleRule', 'disableMangleRule', 'removeMangleRule'] as const;

    it.each(MUTATIONS)('%s is a silent no-op in both when the rule is missing', async (method) => {
      harness.existingRecords = [];

      await expect(viaLibrary((client) => client[method]({ id: '*99', kind: 'id' }))).resolves.toBeUndefined();
      await expect(fake[method]({ id: '*99', kind: 'id' })).resolves.toBeUndefined();
    });

    it('updateMangleRule and moveMangleRule are silent no-ops in both when the rule is missing', async () => {
      harness.existingRecords = [];

      await expect(
        viaLibrary((client) => client.updateMangleRule({ id: '*99', kind: 'id' }, { protocol: 'tcp' })),
      ).resolves.toBeUndefined();
      await expect(fake.updateMangleRule({ id: '*99', kind: 'id' }, { protocol: 'tcp' })).resolves.toBeUndefined();
      await expect(
        viaLibrary((client) => client.moveMangleRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })),
      ).resolves.toBeUndefined();
      await expect(fake.moveMangleRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })).resolves.toBeUndefined();
    });

    it('both resolve a managed-reference locator to the first match', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createMangleRule(SPEC);
      await fake.createMangleRule(SPEC);

      await viaLibrary((client) =>
        client.removeMangleRule({ kind: 'managed-reference', ruleReference: 'marca-voip' }),
      );
      await fake.removeMangleRule({ kind: 'managed-reference', ruleReference: 'marca-voip' });

      expect(harness.captured.find((e) => e.command.endsWith('/remove'))?.attributes.numbers).toBe('*1');
      expect(fake.mangleRules).toHaveLength(1);
    });

    it('an update that omits passthrough leaves it untouched in both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createMangleRule(SPEC);

      await viaLibrary((client) =>
        client.updateMangleRule({ kind: 'managed-reference', ruleReference: 'marca-voip' }, { protocol: 'tcp' }),
      );
      await fake.updateMangleRule({ kind: 'managed-reference', ruleReference: 'marca-voip' }, { protocol: 'tcp' });

      const set = harness.captured.find((e) => e.command.endsWith('/set'));
      expect(set?.attributes).not.toHaveProperty('passthrough');
      expect((await fake.listMangleRules())[0]?.passthrough).toBe(true);
    });
  });
});
