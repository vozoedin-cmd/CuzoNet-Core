import { describe, it, expect, beforeEach } from 'vitest';

import type { RouterOsRawRuleCreateData } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient Raw rules', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  const BASE: RouterOsRawRuleCreateData = {
    action: 'drop',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-raw:block-bogons',
  };

  const withRef = (reference: string, overrides: Partial<RouterOsRawRuleCreateData> = {}): RouterOsRawRuleCreateData => ({
    ...BASE,
    comment: `cuzonet:firewall-raw:${reference}`,
    ...overrides,
  });

  describe('create', () => {
    it('creates a rule and parses its ruleReference from the Raw comment marker', async () => {
      await client.createRawRule({ ...BASE, comment: 'cuzonet:firewall-raw:block-bogons Bloqueo de bogons' });

      expect(client.rawRules).to.have.length(1);
      expect(client.rawRules[0]).to.include({
        action: 'drop',
        chain: 'prerouting',
        disabled: false,
        ruleReference: 'block-bogons',
      });
      expect(client.rawRules[0]?.id).to.match(/^\*\d+$/);
    });

    it('keeps Raw rules separate from filter, NAT and Mangle rules sharing the reference', async () => {
      await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:shared' });
      await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:shared' });
      await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:shared' });
      await client.createRawRule(withRef('shared'));

      expect(client.rawRules).to.have.length(1);
      expect(await client.findRawRulesByReference('shared')).to.have.length(1);
      expect((await client.findRawRulesByReference('shared'))[0]?.action).to.equal('drop');
    });

    it('stores every observed optional field', async () => {
      await client.createRawRule({
        ...BASE,
        addressList: 'sospechosos',
        addressListTimeout: '1h',
        dstAddress: '10.0.0.0/8',
        dstAddressList: 'destinos',
        dstPort: '443',
        inInterface: 'ether1',
        logPrefix: 'RAW',
        outInterface: 'ether2',
        packetMark: 'marca',
        protocol: 'tcp',
        srcAddress: '192.168.88.0/24',
        srcAddressList: 'origenes',
        srcPort: '1024-65535',
        tcpFlags: 'syn',
      });

      expect(await client.listRawRules()).to.have.length(1);
      expect((await client.listRawRules())[0]).to.include({
        addressList: 'sospechosos',
        addressListTimeout: '1h',
        dstAddress: '10.0.0.0/8',
        dstAddressList: 'destinos',
        dstPort: '443',
        inInterface: 'ether1',
        logPrefix: 'RAW',
        outInterface: 'ether2',
        packetMark: 'marca',
        protocol: 'tcp',
        srcAddress: '192.168.88.0/24',
        srcAddressList: 'origenes',
        srcPort: '1024-65535',
        tcpFlags: 'syn',
      });
    });

    it('omits every optional field the caller did not decide', async () => {
      await client.createRawRule(BASE);

      const [rule] = await client.listRawRules();
      for (const absent of [
        'protocol', 'srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface', 'outInterface',
        'srcAddressList', 'dstAddressList', 'tcpFlags', 'packetMark', 'log', 'logPrefix',
        'jumpTarget', 'addressList', 'addressListTimeout',
      ]) {
        expect(rule, absent).to.not.have.property(absent);
      }
    });

    it('materialises the read-only fields the router always reports', async () => {
      await client.createRawRule(BASE);

      expect((await client.listRawRules())[0]).to.include({
        bytes: 0,
        disabled: false,
        dynamic: false,
        invalid: false,
        packets: 0,
      });
    });

    it('honours an explicit disabled=true from the create', async () => {
      await client.createRawRule({ ...BASE, disabled: true });

      expect((await client.listRawRules())[0]?.disabled).to.equal(true);
    });

    it('inserts before an existing rule when placeBeforeId is given', async () => {
      await client.createRawRule(withRef('primera'));
      const first = client.rawRules[0]!.id;
      await client.createRawRule({ ...withRef('nueva'), placeBeforeId: first });

      expect(client.rawRules.map((r) => r.ruleReference)).to.deep.equal(['nueva', 'primera']);
    });

    it('appends when placeBeforeId is omitted', async () => {
      await client.createRawRule(withRef('a'));
      await client.createRawRule(withRef('b'));

      expect(client.rawRules.map((r) => r.ruleReference)).to.deep.equal(['a', 'b']);
    });
  });

  /**
   * `log` es OPCIONAL, no un booleano con default. La sonda de la Fase 0-bis comprobo que el
   * router omite el campo cuando es falso, incluso pidiendolo por `.proplist`. Un `false`
   * explicito, en cambio, tiene que conservarse.
   */
  describe('log', () => {
    it('omits log entirely when the caller does not decide it', async () => {
      await client.createRawRule(BASE);

      expect((await client.listRawRules())[0]).to.not.have.property('log');
    });

    it('preserves an explicit log=false instead of collapsing it into absence', async () => {
      await client.createRawRule({ ...BASE, log: false });

      const [rule] = await client.listRawRules();
      expect(rule).to.have.property('log');
      expect(rule?.log).to.equal(false);
    });

    it('preserves log=true', async () => {
      await client.createRawRule({ ...BASE, log: true, logPrefix: 'RAW' });

      expect((await client.listRawRules())[0]).to.include({ log: true, logPrefix: 'RAW' });
    });
  });

  describe('ownership', () => {
    it('derives a valid ownership with reference and user comment', async () => {
      await client.createRawRule({ ...BASE, comment: 'cuzonet:firewall-raw:ref texto libre' });

      expect((await client.listRawRules())[0]?.ownership).to.deep.equal({
        ruleReference: 'ref',
        status: 'valid',
        userComment: 'texto libre',
      });
    });

    it.each([
      ['unmanaged', 'puesta a mano por el operador'],
      ['foreign', 'cuzonet:firewall-nat:otra'],
      ['malformed', 'cuzonet:firewall-raw:'],
    ])('classifies a %s comment and leaves it unresolvable', async (status, comment) => {
      await client.createRawRule({ ...BASE, comment });

      expect((await client.listRawRules())[0]?.ownership.status).to.equal(status);
      expect((await client.listRawRules())[0]?.ownership.ruleReference).to.equal(undefined);
      expect(await client.findRawRulesByReference('ref')).to.deep.equal([]);
    });
  });

  describe('list and lookup', () => {
    it('returns an empty list when the router holds no Raw rules', async () => {
      expect(await client.listRawRules()).to.deep.equal([]);
    });

    it('lists several rules in physical order with physicalIndex', async () => {
      for (const reference of ['a', 'b', 'c']) await client.createRawRule(withRef(reference));

      const rules = await client.listRawRules();

      expect(rules.map((r) => [r.ownership.ruleReference, r.physicalIndex])).to.deep.equal([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]);
    });

    it('findRawRuleById returns the rule without physicalIndex', async () => {
      await client.createRawRule(withRef('a'));
      await client.createRawRule(withRef('b'));
      const second = client.rawRules[1]!.id;

      const rule = await client.findRawRuleById(second);

      expect(rule?.ownership.ruleReference).to.equal('b');
      expect(rule).to.not.have.property('physicalIndex');
    });

    it('findRawRuleById returns null for an unknown id', async () => {
      expect(await client.findRawRuleById('*99')).to.equal(null);
    });

    it('findRawRulesByReference returns nothing when no rule matches', async () => {
      await client.createRawRule(withRef('a'));

      expect(await client.findRawRulesByReference('no-existe')).to.deep.equal([]);
    });

    it('findRawRulesByReference returns the single match with its physicalIndex', async () => {
      await client.createRawRule(withRef('a'));
      await client.createRawRule(withRef('b'));

      const matches = await client.findRawRulesByReference('b');

      expect(matches).to.have.length(1);
      expect(matches[0]?.physicalIndex).to.equal(1);
    });

    /** Sin guarda de ambiguedad aqui: resolver 0/1/N corresponde al adapter de la Fase 4. */
    it('findRawRulesByReference returns every match when a reference is duplicated', async () => {
      await client.createRawRule(withRef('dup'));
      await client.createRawRule(withRef('otra'));
      await client.createRawRule(withRef('dup'));

      const matches = await client.findRawRulesByReference('dup');

      expect(matches).to.have.length(2);
      expect(matches.map((m) => m.physicalIndex)).to.deep.equal([0, 2]);
    });

    /** Un comentario vacio es un valor, no una ausencia: el router lo devolveria igual. */
    it('keeps an empty comment as an empty string and classifies it unmanaged', async () => {
      await client.createRawRule({ ...BASE, comment: '' });

      const [rule] = await client.listRawRules();
      expect(rule?.comment).to.equal('');
      expect(rule?.ownership.status).to.equal('unmanaged');
    });

    /**
     * Una regla SIN comentario no se puede crear por el puerto —`comment` es obligatorio en
     * `ManagedRawRuleSpec`— asi que solo existe en el router, puesta por otro. Se siembra
     * directamente para comprobar que el doble sabe representarla: si no supiera, ninguna
     * prueba del adapter podria distinguirla de una administrada.
     */
    it('omits comment entirely for a rule the router holds without one', async () => {
      client.rawRules = [
        {
          action: 'accept',
          bytes: 0,
          chain: 'prerouting',
          disabled: false,
          dynamic: false,
          id: '*7',
          invalid: false,
          packets: 0,
        },
      ];

      const [rule] = await client.listRawRules();

      expect(rule).to.not.have.property('comment');
      expect(rule?.ownership).to.deep.equal({ status: 'unmanaged' });
    });

    /** `dynamic`, `invalid`, `bytes` y `packets` los impone el router; el doble debe saber representarlos. */
    it('reports router-imposed dynamic, invalid and counters when seeded directly', async () => {
      client.rawRules = [
        {
          action: 'drop',
          bytes: 98765,
          chain: 'prerouting',
          comment: 'cuzonet:firewall-raw:seeded',
          disabled: false,
          dynamic: true,
          id: '*8',
          invalid: true,
          packets: 4321,
        },
      ];

      expect((await client.listRawRules())[0]).to.include({
        bytes: 98765,
        dynamic: true,
        invalid: true,
        packets: 4321,
      });
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await client.createRawRule({ ...withRef('ref'), protocol: 'tcp' });
    });

    const locator = { kind: 'managed-reference', ruleReference: 'ref' } as const;

    it('applies only the declared fields and preserves the rest', async () => {
      await client.updateRawRule(locator, { srcAddress: '10.0.0.0/8' });

      expect((await client.listRawRules())[0]).to.include({
        action: 'drop',
        chain: 'prerouting',
        protocol: 'tcp',
        srcAddress: '10.0.0.0/8',
      });
    });

    it('applies an explicit log=false', async () => {
      await client.updateRawRule(locator, { log: false });

      expect((await client.listRawRules())[0]?.log).to.equal(false);
    });

    it('applies an explicit disabled=true', async () => {
      await client.updateRawRule(locator, { disabled: true });

      expect((await client.listRawRules())[0]?.disabled).to.equal(true);
    });

    it('re-derives the ruleReference when the comment changes', async () => {
      await client.updateRawRule(locator, { comment: 'cuzonet:firewall-raw:otra-ref' });

      expect(client.rawRules[0]?.ruleReference).to.equal('otra-ref');
      expect(await client.findRawRulesByReference('otra-ref')).to.have.length(1);
    });

    it('is a silent no-op when the rule does not exist', async () => {
      await expect(client.updateRawRule({ id: '*99', kind: 'id' }, { protocol: 'udp' })).resolves.toBeUndefined();
      expect((await client.listRawRules())[0]?.protocol).to.equal('tcp');
    });

    it('leaves the rule untouched when the patch carries no fields', async () => {
      const before = await client.listRawRules();

      await client.updateRawRule(locator, {});

      expect(await client.listRawRules()).to.deep.equal(before);
    });
  });

  describe('locators', () => {
    beforeEach(async () => {
      await client.createRawRule(withRef('por-referencia'));
    });

    it('resolves by managed reference', async () => {
      await client.disableRawRule({ kind: 'managed-reference', ruleReference: 'por-referencia' });

      expect(client.rawRules[0]?.disabled).to.equal(true);
    });

    it('resolves by id', async () => {
      await client.disableRawRule({ id: client.rawRules[0]!.id, kind: 'id' });

      expect(client.rawRules[0]?.disabled).to.equal(true);
    });

    it('does nothing when neither locator matches', async () => {
      await client.disableRawRule({ id: '*99', kind: 'id' });
      await client.disableRawRule({ kind: 'managed-reference', ruleReference: 'no-existe' });

      expect(client.rawRules[0]?.disabled).to.equal(false);
    });
  });

  describe('move', () => {
    beforeEach(async () => {
      for (const reference of ['a', 'b', 'c']) await client.createRawRule(withRef(reference));
    });

    const order = () => client.rawRules.map((r) => r.ruleReference);

    it('moves a rule before another one by its id', async () => {
      const first = client.rawRules[0]!.id;

      await client.moveRawRule({ kind: 'managed-reference', ruleReference: 'c' }, { placeBeforeId: first });

      expect(order()).to.deep.equal(['c', 'a', 'b']);
    });

    it('moves a rule to the end when placeBeforeId is omitted', async () => {
      await client.moveRawRule({ kind: 'managed-reference', ruleReference: 'a' }, {});

      expect(order()).to.deep.equal(['b', 'c', 'a']);
    });

    it('leaves the already-last rule at the end', async () => {
      await client.moveRawRule({ kind: 'managed-reference', ruleReference: 'c' }, {});

      expect(order()).to.deep.equal(['a', 'b', 'c']);
    });

    it('is a silent no-op when the rule does not exist', async () => {
      await client.moveRawRule({ id: '*99', kind: 'id' }, {});

      expect(order()).to.deep.equal(['a', 'b', 'c']);
    });
  });

  describe('enable, disable and remove', () => {
    beforeEach(async () => {
      await client.createRawRule({ ...withRef('ref'), disabled: true });
    });

    const locator = { kind: 'managed-reference', ruleReference: 'ref' } as const;

    it('enables a disabled rule', async () => {
      await client.enableRawRule(locator);

      expect(client.rawRules[0]?.disabled).to.equal(false);
    });

    it('disables an enabled rule', async () => {
      await client.enableRawRule(locator);
      await client.disableRawRule(locator);

      expect(client.rawRules[0]?.disabled).to.equal(true);
    });

    it('removes the rule', async () => {
      await client.removeRawRule(locator);

      expect(client.rawRules).to.deep.equal([]);
      expect(await client.listRawRules()).to.deep.equal([]);
    });

    it('removes only the addressed rule', async () => {
      await client.createRawRule(withRef('otra'));

      await client.removeRawRule(locator);

      expect(client.rawRules.map((r) => r.ruleReference)).to.deep.equal(['otra']);
    });

    it.each(['enableRawRule', 'disableRawRule', 'removeRawRule'] as const)(
      '%s is a silent no-op when the rule is missing',
      async (method) => {
        await expect(client[method]({ id: '*99', kind: 'id' })).resolves.toBeUndefined();
        expect(client.rawRules).to.have.length(1);
      },
    );
  });

  describe('closed client', () => {
    it.each([
      'listRawRules',
      'createRawRule',
      'findRawRuleById',
      'findRawRulesByReference',
      'updateRawRule',
      'moveRawRule',
      'enableRawRule',
      'disableRawRule',
      'removeRawRule',
    ])('%s rejects once the client is closed', async (method) => {
      await client.close();

      const locator = { id: '*1', kind: 'id' } as const;
      const call: Record<string, () => Promise<unknown>> = {
        createRawRule: () => client.createRawRule(BASE),
        disableRawRule: () => client.disableRawRule(locator),
        enableRawRule: () => client.enableRawRule(locator),
        findRawRuleById: () => client.findRawRuleById('*1'),
        findRawRulesByReference: () => client.findRawRulesByReference('ref'),
        listRawRules: () => client.listRawRules(),
        moveRawRule: () => client.moveRawRule(locator, {}),
        removeRawRule: () => client.removeRawRule(locator),
        updateRawRule: () => client.updateRawRule(locator, { protocol: 'tcp' }),
      };

      await expect(call[method]!()).rejects.toThrow('Client is closed');
    });
  });
});
