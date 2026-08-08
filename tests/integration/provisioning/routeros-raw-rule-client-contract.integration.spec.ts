import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ObservedRawRule,
  RouterOsClientPort,
  RouterOsRawRuleCreateData,
} from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { FakeRouterOsRawRule } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Contract tests entre los dos RouterOsClientPort de Firewall Raw.
 *
 * El doble es lo unico que ejercitaran las pruebas del adapter, asi que cualquier punto en
 * el que sea mas permisivo o mas rico que el cliente real se convierte en un bug que la
 * suite en verde no detecta. En Mangle ese riesgo se materializo con `passthrough`; aqui el
 * campo analogo es `log`, y por eso el doble lo modela opcional en vez de materializarlo.
 */
describe('RouterOsClientPort contract for Firewall Raw (Fake vs Library)', () => {
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
  const SPEC: RouterOsRawRuleCreateData = {
    action: 'drop',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-raw:block-bogons bloqueo',
    protocol: 'tcp',
  };

  const ROUTER_REPLY = {
    '.id': '*1',
    action: 'drop',
    bytes: '0',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-raw:block-bogons bloqueo',
    disabled: 'false',
    dynamic: 'false',
    invalid: 'false',
    packets: '0',
    protocol: 'tcp',
  };

  /** El doble asigna ids propios; la identidad no forma parte del contrato comparado. */
  function comparableShape(rule: ObservedRawRule | null | undefined): unknown {
    if (rule === null || rule === undefined) return null;
    const { id: _id, ...rest } = rule;
    return rest;
  }

  describe('read shape parity', () => {
    it('listRawRules yields an identical ObservedRawRule from both clients', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);

      const fromLibrary = await viaLibrary((client) => client.listRawRules());
      const fromFake = await fake.listRawRules();

      expect(fromLibrary).toHaveLength(1);
      expect(fromFake).toHaveLength(1);
      expect(comparableShape(fromFake[0])).toEqual(comparableShape(fromLibrary[0]));
    });

    /**
     * El campo con riesgo de asimetria en este recurso. El router OMITE `log` cuando es
     * falso, asi que el doble tiene que omitirlo tambien: materializarlo lo haria mas rico
     * que el cliente real y ocultaria el defecto, como paso con `passthrough` en Mangle.
     */
    it('both omit log entirely when the caller never decided it', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);

      expect((await viaLibrary((client) => client.listRawRules()))[0]).not.toHaveProperty('log');
      expect((await fake.listRawRules())[0]).not.toHaveProperty('log');
    });

    it('both report an explicit log=false identically', async () => {
      harness.existingRecords = [{ ...ROUTER_REPLY, log: 'false' }];
      await fake.createRawRule({ ...SPEC, log: false });

      expect((await viaLibrary((client) => client.listRawRules()))[0]?.log).toBe(false);
      expect((await fake.listRawRules())[0]?.log).toBe(false);
    });

    it('both report an explicit log=true identically', async () => {
      harness.existingRecords = [{ ...ROUTER_REPLY, log: 'true', 'log-prefix': 'RAW' }];
      await fake.createRawRule({ ...SPEC, log: true, logPrefix: 'RAW' });

      expect((await viaLibrary((client) => client.listRawRules()))[0]).toMatchObject({ log: true, logPrefix: 'RAW' });
      expect((await fake.listRawRules())[0]).toMatchObject({ log: true, logPrefix: 'RAW' });
    });

    it('both derive the same ownership from the same comment', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);

      const fromLibrary = (await viaLibrary((client) => client.listRawRules()))[0];
      const fromFake = (await fake.listRawRules())[0];

      expect(fromFake?.ownership).toEqual(fromLibrary?.ownership);
      expect(fromFake?.ownership).toEqual({
        ruleReference: 'block-bogons',
        status: 'valid',
        userComment: 'bloqueo',
      });
    });

    it('both expose the Raw-specific matchers and effects', async () => {
      const extras = {
        addressList: 'sospechosos',
        addressListTimeout: '1h',
        jumpTarget: 'mi-chain',
        packetMark: 'PM',
        srcAddressList: 'origenes',
        tcpFlags: 'syn',
      };
      harness.existingRecords = [{
        ...ROUTER_REPLY,
        'address-list': 'sospechosos',
        'address-list-timeout': '1h',
        'jump-target': 'mi-chain',
        'packet-mark': 'PM',
        'src-address-list': 'origenes',
        'tcp-flags': 'syn',
      }];
      await fake.createRawRule({ ...SPEC, ...extras });

      expect((await viaLibrary((client) => client.listRawRules()))[0]).toMatchObject(extras);
      expect((await fake.listRawRules())[0]).toMatchObject(extras);
    });

    it('both assign physicalIndex from the physical order of the listing', async () => {
      harness.existingRecords = [
        { ...ROUTER_REPLY, '.id': '*1' },
        { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-raw:second' },
      ];
      await fake.createRawRule(SPEC);
      await fake.createRawRule({ ...SPEC, comment: 'cuzonet:firewall-raw:second' });

      expect((await viaLibrary((client) => client.listRawRules())).map((r) => r.physicalIndex)).toEqual([0, 1]);
      expect((await fake.listRawRules()).map((r) => r.physicalIndex)).toEqual([0, 1]);
    });

    it('both omit the same optional properties for a bare rule', async () => {
      const bare = { action: 'accept', chain: 'prerouting', comment: 'cuzonet:firewall-raw:bare' };
      harness.existingRecords = [{
        '.id': '*1', action: 'accept', chain: 'prerouting', comment: bare.comment,
      }];
      await fake.createRawRule(bare);

      const fromLibrary = (await viaLibrary((client) => client.listRawRules()))[0];
      const fromFake = (await fake.listRawRules())[0];

      expect(Object.keys(comparableShape(fromFake) as object).sort()).toEqual(
        Object.keys(comparableShape(fromLibrary) as object).sort(),
      );
    });

    it('both classify an unmanaged rule the same way and leave it unresolvable', async () => {
      const foreign = { action: 'accept', chain: 'prerouting', comment: 'puesta a mano' };
      harness.existingRecords = [{ '.id': '*1', action: 'accept', chain: 'prerouting', comment: 'puesta a mano' }];
      await fake.createRawRule(foreign);

      expect((await viaLibrary((client) => client.listRawRules()))[0]?.ownership).toEqual({ status: 'unmanaged' });
      expect((await fake.listRawRules())[0]?.ownership).toEqual({ status: 'unmanaged' });
      expect(await viaLibrary((client) => client.findRawRulesByReference('puesta a mano'))).toEqual([]);
      expect(await fake.findRawRulesByReference('puesta a mano')).toEqual([]);
    });

    it('both report an empty router as an empty list', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.listRawRules())).toEqual([]);
      expect(await fake.listRawRules()).toEqual([]);
    });

    it('both list several rules in the same physical order and with the same shape', async () => {
      const comments = ['uno', 'dos', 'tres'].map((n) => `cuzonet:firewall-raw:${n}`);
      harness.existingRecords = comments.map((comment, i) => ({ ...ROUTER_REPLY, '.id': `*${i + 1}`, comment }));
      for (const comment of comments) await fake.createRawRule({ ...SPEC, comment });

      const fromLibrary = await viaLibrary((client) => client.listRawRules());
      const fromFake = await fake.listRawRules();

      expect(fromFake.map(comparableShape)).toEqual(fromLibrary.map(comparableShape));
      expect(fromFake.map((rule) => rule.ownership.ruleReference)).toEqual(['uno', 'dos', 'tres']);
    });
  });

  /**
   * `dynamic`, `invalid`, `bytes`, `packets` y un comentario ausente no se pueden producir a
   * traves del puerto: son estado que impone el router. Se siembran directamente en el doble,
   * que es justo donde vive el riesgo — si el doble no supiera representarlos, ninguna prueba
   * del adapter podria distinguir una regla dinamica de una administrada.
   */
  describe('read-only field parity', () => {
    const OBSERVED_ONLY_REPLY = {
      '.id': '*4',
      action: 'accept',
      bytes: '98765',
      chain: 'prerouting',
      disabled: 'false',
      dynamic: 'true',
      invalid: 'true',
      packets: '4321',
    };

    const OBSERVED_ONLY_ROW: FakeRouterOsRawRule = {
      action: 'accept',
      bytes: 98765,
      chain: 'prerouting',
      disabled: false,
      dynamic: true,
      id: '*4',
      invalid: true,
      packets: 4321,
    };

    beforeEach(() => {
      harness.existingRecords = [OBSERVED_ONLY_REPLY];
      fake.rawRules = [OBSERVED_ONLY_ROW];
    });

    it('both surface dynamic and invalid as booleans with the same value', async () => {
      expect((await viaLibrary((client) => client.listRawRules()))[0]).toMatchObject({ dynamic: true, invalid: true });
      expect((await fake.listRawRules())[0]).toMatchObject({ dynamic: true, invalid: true });
    });

    it('both surface bytes and packets as numbers with the same value', async () => {
      expect((await viaLibrary((client) => client.listRawRules()))[0]).toMatchObject({ bytes: 98765, packets: 4321 });
      expect((await fake.listRawRules())[0]).toMatchObject({ bytes: 98765, packets: 4321 });
    });

    it('both omit comment entirely and report the rule as unmanaged when there is none', async () => {
      const fromLibrary = (await viaLibrary((client) => client.listRawRules()))[0];
      const fromFake = (await fake.listRawRules())[0];

      expect(fromFake).not.toHaveProperty('comment');
      expect(fromLibrary).not.toHaveProperty('comment');
      expect(fromFake?.ownership).toEqual({ status: 'unmanaged' });
      expect(comparableShape(fromFake)).toEqual(comparableShape(fromLibrary));
    });
  });

  describe('lookup parity', () => {
    it('findRawRulesByReference returns the same shape from both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);

      expect(comparableShape((await fake.findRawRulesByReference('block-bogons'))[0])).toEqual(
        comparableShape((await viaLibrary((client) => client.findRawRulesByReference('block-bogons')))[0]),
      );
    });

    it('findRawRulesByReference returns every match, not just the first, in both', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createRawRule(SPEC);
      await fake.createRawRule(SPEC);

      expect(await viaLibrary((client) => client.findRawRulesByReference('block-bogons'))).toHaveLength(2);
      expect(await fake.findRawRulesByReference('block-bogons')).toHaveLength(2);
    });

    it('findRawRulesByReference yields an empty array in both when nothing matches', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);

      expect(await viaLibrary((client) => client.findRawRulesByReference('nope'))).toEqual([]);
      expect(await fake.findRawRulesByReference('nope')).toEqual([]);
    });

    it('findRawRuleById yields null in both when the id is unknown', async () => {
      harness.existingRecords = [];

      expect(await viaLibrary((client) => client.findRawRuleById('*99'))).toBeNull();
      expect(await fake.findRawRuleById('*99')).toBeNull();
    });

    it('findRawRuleById omits physicalIndex in both clients', async () => {
      await fake.createRawRule({ ...SPEC, comment: 'cuzonet:firewall-raw:first' });
      await fake.createRawRule(SPEC);
      const second = fake.rawRules[1];
      harness.existingRecord = { ...ROUTER_REPLY, '.id': second?.id ?? '*2' };

      const fromFake = await fake.findRawRuleById(second?.id ?? '*2');
      const fromLibrary = await viaLibrary((client) => client.findRawRuleById(second?.id ?? '*2'));

      expect(fromFake).not.toHaveProperty('physicalIndex');
      expect(fromLibrary).not.toHaveProperty('physicalIndex');
      expect(comparableShape(fromFake)).toEqual(comparableShape(fromLibrary));
    });
  });

  describe('mutation parity', () => {
    const MUTATIONS = ['enableRawRule', 'disableRawRule', 'removeRawRule'] as const;

    it.each(MUTATIONS)('%s is a silent no-op in both when the rule is missing', async (method) => {
      harness.existingRecords = [];

      await expect(viaLibrary((client) => client[method]({ id: '*99', kind: 'id' }))).resolves.toBeUndefined();
      await expect(fake[method]({ id: '*99', kind: 'id' })).resolves.toBeUndefined();
    });

    it('updateRawRule and moveRawRule are silent no-ops in both when the rule is missing', async () => {
      harness.existingRecords = [];

      await expect(
        viaLibrary((client) => client.updateRawRule({ id: '*99', kind: 'id' }, { protocol: 'tcp' })),
      ).resolves.toBeUndefined();
      await expect(fake.updateRawRule({ id: '*99', kind: 'id' }, { protocol: 'tcp' })).resolves.toBeUndefined();
      await expect(
        viaLibrary((client) => client.moveRawRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })),
      ).resolves.toBeUndefined();
      await expect(fake.moveRawRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' })).resolves.toBeUndefined();
    });

    it('both resolve a managed-reference locator to the first match', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2' }];
      await fake.createRawRule(SPEC);
      await fake.createRawRule(SPEC);

      await viaLibrary((client) => client.removeRawRule({ kind: 'managed-reference', ruleReference: 'block-bogons' }));
      await fake.removeRawRule({ kind: 'managed-reference', ruleReference: 'block-bogons' });

      expect(harness.captured.find((e) => e.command.endsWith('/remove'))?.attributes.numbers).toBe('*1');
      expect(fake.rawRules).toHaveLength(1);
    });

    it('createRawRule places a new rule before an existing one in both', async () => {
      const second = { ...SPEC, comment: 'cuzonet:firewall-raw:segunda' };
      await fake.createRawRule(SPEC);
      await fake.createRawRule({ ...second, placeBeforeId: fake.rawRules[0]?.id ?? '*1' });

      await viaLibrary((client) => client.createRawRule({ ...second, placeBeforeId: '*1' }));

      expect(harness.captured[0]?.attributes['place-before']).toBe('*1');
      expect(fake.rawRules.map((r) => r.ruleReference)).toEqual(['segunda', 'block-bogons']);
    });

    it('updateRawRule applies the requested field in both, resolved through the same locator', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);
      const locator = { kind: 'managed-reference', ruleReference: 'block-bogons' } as const;

      await viaLibrary((client) => client.updateRawRule(locator, { protocol: 'udp' }));
      await fake.updateRawRule(locator, { protocol: 'udp' });

      expect(harness.captured.find((e) => e.command.endsWith('/set'))?.attributes)
        .toEqual({ numbers: '*1', protocol: 'udp' });
      expect((await fake.listRawRules())[0]?.protocol).toBe('udp');
    });

    it('an update that omits log leaves it untouched in both', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);
      const locator = { kind: 'managed-reference', ruleReference: 'block-bogons' } as const;

      await viaLibrary((client) => client.updateRawRule(locator, { protocol: 'udp' }));
      await fake.updateRawRule(locator, { protocol: 'udp' });

      expect(harness.captured.find((e) => e.command.endsWith('/set'))?.attributes).not.toHaveProperty('log');
      expect((await fake.listRawRules())[0]).not.toHaveProperty('log');
    });

    it.each([
      ['disableRawRule', '/disable', true],
      ['enableRawRule', '/enable', false],
    ] as const)('%s acts on the same resolved rule in both', async (method, suffix, expected) => {
      harness.existingRecords = [{ ...ROUTER_REPLY, disabled: expected ? 'false' : 'true' }];
      await fake.createRawRule({ ...SPEC, disabled: !expected });
      const locator = { kind: 'managed-reference', ruleReference: 'block-bogons' } as const;

      await viaLibrary((client) => client[method](locator));
      await fake[method](locator);

      expect(harness.captured.find((e) => e.command.endsWith(suffix))?.attributes).toEqual({ numbers: '*1' });
      expect((await fake.listRawRules())[0]?.disabled).toBe(expected);
    });

    it('moveRawRule reorders in the double and targets the same rule on the wire', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-raw:otra' }];
      await fake.createRawRule(SPEC);
      await fake.createRawRule({ ...SPEC, comment: 'cuzonet:firewall-raw:otra' });
      const target = fake.rawRules[0]?.id ?? '*1';

      await viaLibrary((client) =>
        client.moveRawRule({ kind: 'managed-reference', ruleReference: 'otra' }, { placeBeforeId: '*1' }),
      );
      await fake.moveRawRule({ kind: 'managed-reference', ruleReference: 'otra' }, { placeBeforeId: target });

      expect(harness.captured.find((e) => e.command.endsWith('/move'))?.attributes)
        .toEqual({ destination: '*1', numbers: '*2' });
      expect(fake.rawRules.map((r) => r.ruleReference)).toEqual(['otra', 'block-bogons']);
    });

    it('both move to the end without a destination when placeBeforeId is omitted', async () => {
      harness.existingRecords = [ROUTER_REPLY, { ...ROUTER_REPLY, '.id': '*2', comment: 'cuzonet:firewall-raw:otra' }];
      await fake.createRawRule(SPEC);
      await fake.createRawRule({ ...SPEC, comment: 'cuzonet:firewall-raw:otra' });
      const locator = { kind: 'managed-reference', ruleReference: 'block-bogons' } as const;

      await viaLibrary((client) => client.moveRawRule(locator, {}));
      await fake.moveRawRule(locator, {});

      const move = harness.captured.find((e) => e.command.endsWith('/move'));
      expect(move?.attributes).toEqual({ numbers: '*1' });
      expect(fake.rawRules.map((r) => r.ruleReference)).toEqual(['otra', 'block-bogons']);
    });
  });

  /**
   * GAPs HEREDADOS del patron compartido, no introducidos por Raw. Se fijan aqui para que
   * sean visibles y para que su correccion —que es transversal a Filter, NAT y Mangle— se
   * vea en el diff el dia que se aborde.
   */
  describe('inherited GAPs', () => {
    /**
     * `insertRuleAt` es compartido por los cuatro recursos. Con un `placeBeforeId`
     * inexistente el doble hace `push` y deja la regla al final en silencio, mientras que el
     * cliente real manda el destino tal cual y el router responde `no such item`.
     */
    it('GAP: an unknown move destination is silently appended by the double and rejected by the router', async () => {
      harness.existingRecords = [ROUTER_REPLY];
      await fake.createRawRule(SPEC);
      await fake.createRawRule({ ...SPEC, comment: 'cuzonet:firewall-raw:otra' });
      const locator = { kind: 'managed-reference', ruleReference: 'block-bogons' } as const;

      await fake.moveRawRule(locator, { placeBeforeId: '*inexistente' });
      expect(fake.rawRules.map((r) => r.ruleReference)).toEqual(['otra', 'block-bogons']);

      harness.trap = { forCommandEndingIn: '/move', message: 'no such item' };
      await expect(viaLibrary((client) => client.moveRawRule(locator, { placeBeforeId: '*inexistente' }))).rejects.toThrow(
        'no such item',
      );
    });

    /**
     * El doble guarda la `ruleReference` resuelta; el cliente real la reparsea en cada
     * lectura. Si un `update` sustituye el comentario por uno sin marcador, el doble sigue
     * resolviendo la regla por la referencia vieja y el cliente real ya la reporta como
     * `unmanaged`. Mismo comportamiento en Filter, NAT y Mangle.
     */
    it('GAP: dropping the marker on update leaves the double still resolving by the old reference', async () => {
      harness.existingRecords = [{ ...ROUTER_REPLY, comment: 'ya no lleva marcador' }];
      await fake.createRawRule(SPEC);

      await fake.updateRawRule(
        { kind: 'managed-reference', ruleReference: 'block-bogons' },
        { comment: 'ya no lleva marcador' },
      );

      // El cliente real: sin marcador, la regla deja de ser resoluble.
      expect(await viaLibrary((client) => client.findRawRulesByReference('block-bogons'))).toEqual([]);
      expect((await viaLibrary((client) => client.listRawRules()))[0]?.ownership.status).toBe('unmanaged');
      // El doble: la sigue encontrando por la referencia vieja.
      expect(await fake.findRawRulesByReference('block-bogons')).toHaveLength(1);
      expect((await fake.listRawRules())[0]?.ownership.status).toBe('unmanaged');
    });
  });
});
