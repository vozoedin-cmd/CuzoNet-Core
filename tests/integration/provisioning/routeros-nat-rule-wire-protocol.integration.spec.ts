import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObservedNatRule } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Certificacion de wire protocol para /ip/firewall/nat contra el framing binario real de
 * RouterOS. Fija comandos, atributos, selectores, `.proplist` y el mapeo de respuestas y
 * de traps que produce LibraryRouterOsClient.
 *
 * No introduce capacidades: describe y bloquea lo que el cliente hace tras la Fase 1.
 */
describe('LibraryRouterOsClient wire protocol (Firewall NAT)', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  async function withClient<T>(run: (client: LibraryRouterOsClient) => Promise<T>): Promise<T> {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      return await run(client);
    } finally {
      await client.close();
    }
  }

  /** Forma tipica de una regla NAT administrada devuelta por RouterOS 7.21.4. */
  const managedRule = {
    '.id': '*3',
    action: 'dst-nat',
    bytes: '2048',
    chain: 'dstnat',
    comment: 'cuzonet:firewall-nat:port-8080 reenvio web',
    disabled: 'false',
    'dst-port': '8080',
    dynamic: 'false',
    invalid: 'false',
    packets: '16',
    protocol: 'tcp',
    'to-addresses': '192.168.1.50',
    'to-ports': '80',
  };

  const commandsOf = () => harness.captured.map((entry) => entry.command);

  // =====================================================================
  // PRINT
  // =====================================================================
  describe('PRINT', () => {
    it('listNatRules sends /ip/firewall/nat/print with no queries and no duplicated suffix', async () => {
      await withClient((client) => client.listNatRules());

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/nat/print');
      expect(harness.captured[0]?.queries).toEqual([]);
    });

    it('requests exactly the NAT_RULE_PROPLIST fields, in order', async () => {
      await withClient((client) => client.listNatRules());

      expect(harness.captured[0]?.attributes['.proplist']?.split(',')).toEqual([
        '.id', 'chain', 'action', 'protocol', 'src-address', 'dst-address', 'src-port',
        'dst-port', 'in-interface', 'out-interface', 'connection-state', 'to-addresses',
        'to-ports', 'disabled', 'comment', 'dynamic', 'invalid', 'bytes', 'packets',
      ]);
    });

    it('never asks for attributes the client cannot serialise back', async () => {
      await withClient((client) => client.listNatRules());

      const proplist = harness.captured[0]?.attributes['.proplist'] ?? '';
      for (const absent of ['log', 'log-prefix', 'address-list', 'jump-target']) {
        expect(proplist.split(','), absent).not.toContain(absent);
      }
    });

    it('findNatRuleById selects with ?.id= and asks for the same proplist', async () => {
      harness.existingRecord = managedRule;

      await withClient((client) => client.findNatRuleById('*3'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/nat/print');
      expect(harness.captured[0]?.queries).toEqual(['?.id=*3']);
    });

    it('findNatRulesByReference lists everything and filters client-side, sending no query', async () => {
      harness.existingRecords = [managedRule];

      const found = await withClient((client) => client.findNatRulesByReference('port-8080'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(found.map((rule) => rule.id)).toEqual(['*3']);
    });

    it('maps multiple replies preserving physical order', async () => {
      harness.existingRecords = [
        { ...managedRule, '.id': '*1', chain: 'srcnat' },
        { ...managedRule, '.id': '*2', chain: 'dstnat' },
        { ...managedRule, '.id': '*5', chain: 'srcnat' },
      ];

      const rules = await withClient((client) => client.listNatRules());

      expect(rules.map((rule) => [rule.id, rule.physicalIndex, rule.chain])).toEqual([
        ['*1', 0, 'srcnat'],
        ['*2', 1, 'dstnat'],
        ['*5', 2, 'srcnat'],
      ]);
    });

    it('returns empty results when the router reports no rules', async () => {
      harness.existingRecords = [];

      expect(await withClient((client) => client.listNatRules())).toEqual([]);
      expect(await withClient((client) => client.findNatRuleById('*99'))).toBeNull();
      expect(await withClient((client) => client.findNatRulesByReference('nada'))).toEqual([]);
    });

    it('maps every modelled property of a full reply', async () => {
      harness.existingRecord = {
        '.id': '*7',
        action: 'src-nat',
        bytes: '123456',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:full-rule con detalle',
        'connection-state': 'new',
        disabled: 'true',
        'dst-address': '10.0.0.0/8',
        'dst-port': '443',
        dynamic: 'true',
        'in-interface': 'ether1',
        invalid: 'true',
        'out-interface': 'ether2',
        packets: '789',
        protocol: 'tcp',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
        'to-addresses': '203.0.113.1',
        'to-ports': '8080',
      };

      const rule = await withClient((client) => client.findNatRuleById('*7'));

      expect(rule).toMatchObject({
        action: 'src-nat',
        bytes: 123456,
        chain: 'srcnat',
        connectionState: 'new',
        disabled: true,
        dstAddress: '10.0.0.0/8',
        dstPort: '443',
        dynamic: true,
        id: '*7',
        inInterface: 'ether1',
        invalid: true,
        outInterface: 'ether2',
        packets: 789,
        protocol: 'tcp',
        srcAddress: '192.168.1.0/24',
        srcPort: '1024-65535',
        toAddresses: '203.0.113.1',
        toPorts: '8080',
      });
      expect(rule?.ownership).toEqual({
        ruleReference: 'full-rule',
        status: 'valid',
        userComment: 'con detalle',
      });
    });

    it('omits optional properties the router did not return, instead of emitting empty strings', async () => {
      harness.existingRecord = { '.id': '*1', action: 'masquerade', chain: 'srcnat' };

      const rule = await withClient((client) => client.findNatRuleById('*1'));

      for (const absent of [
        'protocol', 'srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface',
        'outInterface', 'connectionState', 'toAddresses', 'toPorts', 'comment',
      ]) {
        expect(rule, absent).not.toHaveProperty(absent);
      }
      expect(rule).toMatchObject({ bytes: 0, disabled: false, dynamic: false, invalid: false, packets: 0 });
      expect(rule?.ownership.status).toBe('unmanaged');
    });

    it('keeps an empty-string value instead of dropping it as falsy', async () => {
      harness.existingRecord = { '.id': '*1', action: 'masquerade', chain: 'srcnat', 'src-address': '' };

      const rule = await withClient((client) => client.findNatRuleById('*1'));

      expect(rule).toHaveProperty('srcAddress', '');
    });

    it('findNatRuleById omits physicalIndex: a single row cannot know its position', async () => {
      harness.existingRecord = { ...managedRule, '.id': '*42' };

      const rule = await withClient((client) => client.findNatRuleById('*42'));

      expect(rule).not.toHaveProperty('physicalIndex');
    });

    it('findNatRulesByReference reports physicalIndex, since it derives from a listing', async () => {
      harness.existingRecords = [
        { ...managedRule, '.id': '*10', comment: 'cuzonet:firewall-nat:otra' },
        { ...managedRule, '.id': '*42' },
      ];

      const found = await withClient((client) => client.findNatRulesByReference('port-8080'));

      expect(found).toHaveLength(1);
      expect(found[0]?.physicalIndex).toBe(1);
    });
  });

  // =====================================================================
  // ADD
  // =====================================================================
  describe('ADD', () => {
    it('sends the minimum attributes for a minimal rule', async () => {
      await withClient((client) =>
        client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:min' }),
      );

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/nat/add');
      expect(harness.captured[0]?.attributes).toEqual({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:min',
      });
    });

    it('serialises every attribute of a complete rule with RouterOS names', async () => {
      await withClient((client) =>
        client.createNatRule({
          action: 'dst-nat',
          chain: 'dstnat',
          comment: 'cuzonet:firewall-nat:full',
          connectionState: 'new',
          disabled: false,
          dstAddress: '203.0.113.1',
          dstPort: '8080',
          inInterface: 'ether1',
          outInterface: 'ether2',
          protocol: 'tcp',
          srcAddress: '192.168.1.0/24',
          srcPort: '1024-65535',
          toAddresses: '192.168.1.50',
          toPorts: '80',
        }),
      );

      expect(harness.captured[0]?.attributes).toEqual({
        action: 'dst-nat',
        chain: 'dstnat',
        comment: 'cuzonet:firewall-nat:full',
        'connection-state': 'new',
        disabled: 'no',
        'dst-address': '203.0.113.1',
        'dst-port': '8080',
        'in-interface': 'ether1',
        'out-interface': 'ether2',
        protocol: 'tcp',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
        'to-addresses': '192.168.1.50',
        'to-ports': '80',
      });
    });

    it('sends place-before when the rule must be inserted at a position, and omits it otherwise', async () => {
      await withClient(async (client) => {
        await client.createNatRule({
          action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:a', placeBeforeId: '*4',
        });
        await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:b' });
      });

      expect(harness.captured[0]?.attributes['place-before']).toBe('*4');
      expect(harness.captured[1]?.attributes).not.toHaveProperty('place-before');
    });

    it('omits disabled entirely when the caller does not decide it', async () => {
      await withClient((client) =>
        client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:x' }),
      );

      expect(harness.captured[0]?.attributes).not.toHaveProperty('disabled');
    });
  });

  // =====================================================================
  // SET
  // =====================================================================
  describe('SET', () => {
    beforeEach(() => {
      harness.existingRecord = managedRule;
    });

    it('sends only the changed attributes, always with =numbers=', async () => {
      await withClient((client) => client.updateNatRule({ id: '*3', kind: 'id' }, { toPorts: '8081' }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.command).toBe('/ip/firewall/nat/set');
      expect(set?.attributes).toEqual({ numbers: '*3', 'to-ports': '8081' });
    });

    it('never sends attributes the caller omitted', async () => {
      await withClient((client) =>
        client.updateNatRule({ id: '*3', kind: 'id' }, { comment: 'nuevo', toAddresses: '10.0.0.9' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ comment: 'nuevo', numbers: '*3', 'to-addresses': '10.0.0.9' });
    });

    it('sends no /set at all when the update carries no fields', async () => {
      await withClient((client) => client.updateNatRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print']);
    });

    it('clears a field by sending it explicitly as an empty string', async () => {
      await withClient((client) =>
        client.updateNatRule({ id: '*3', kind: 'id' }, { srcAddress: '', toPorts: '' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ numbers: '*3', 'src-address': '', 'to-ports': '' });
    });

    it('serialises disabled as the yes/no wire flag', async () => {
      await withClient(async (client) => {
        await client.updateNatRule({ id: '*3', kind: 'id' }, { disabled: true });
        await client.updateNatRule({ id: '*3', kind: 'id' }, { disabled: false });
      });

      const sets = harness.captured.filter((entry) => entry.command.endsWith('/set'));
      expect(sets[0]?.attributes.disabled).toBe('yes');
      expect(sets[1]?.attributes.disabled).toBe('no');
    });

    it('resolves a managed-reference locator through a full listing before setting', async () => {
      await withClient((client) =>
        client.updateNatRule({ kind: 'managed-reference', ruleReference: 'port-8080' }, { toPorts: '8081' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print', '/ip/firewall/nat/set']);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(harness.captured[1]?.attributes.numbers).toBe('*3');
    });
  });

  // =====================================================================
  // MOVE
  // =====================================================================
  describe('MOVE', () => {
    beforeEach(() => {
      harness.existingRecord = managedRule;
    });

    it('moves before another rule using its .id as destination', async () => {
      await withClient((client) => client.moveNatRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*1' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.command).toBe('/ip/firewall/nat/move');
      expect(move?.attributes).toEqual({ destination: '*1', numbers: '*3' });
    });

    /**
     * REGRESION. `destination` significa "antes del elemento en esa posicion", asi que
     * ningun indice expresa "al final". Antes se enviaba `destination=<numero de reglas>`,
     * siempre fuera de rango: verificado contra RouterOS 7.21.4, devuelve `no such item`.
     */
    it('moves to the end by omitting destination entirely', async () => {
      harness.existingRecords = [
        { ...managedRule, '.id': '*3' },
        { ...managedRule, '.id': '*1' },
        { ...managedRule, '.id': '*2' },
      ];

      await withClient((client) => client.moveNatRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print', '/ip/firewall/nat/move']);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*3' });
      expect(harness.captured[1]?.attributes).not.toHaveProperty('destination');
    });

    it('does nothing when the rule to move does not exist', async () => {
      harness.existingRecords = [];

      await withClient((client) => client.moveNatRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' }));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print']);
    });

    it('does not validate the destination: an unknown target is forwarded as-is', async () => {
      await withClient((client) => client.moveNatRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*999' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.attributes.destination).toBe('*999');
    });
  });

  // =====================================================================
  // ENABLE / DISABLE / REMOVE
  // =====================================================================
  describe('ENABLE, DISABLE and REMOVE', () => {
    const CASES = [
      ['enableNatRule', '/ip/firewall/nat/enable'],
      ['disableNatRule', '/ip/firewall/nat/disable'],
      ['removeNatRule', '/ip/firewall/nat/remove'],
    ] as const;

    it.each(CASES)('%s resolves the rule and sends %s with =numbers=', async (method, command) => {
      harness.existingRecord = managedRule;

      await withClient((client) => client[method]({ id: '*3', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print', command]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*3' });
    });

    it.each(CASES)('%s does nothing when the rule does not exist', async (method) => {
      harness.existingRecords = [];

      await withClient((client) => client[method]({ id: '*99', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print']);
    });

    it.each(CASES)('%s accepts a managed-reference locator', async (method, command) => {
      harness.existingRecords = [managedRule];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'port-8080' }));

      expect(commandsOf()).toEqual(['/ip/firewall/nat/print', command]);
      expect(harness.captured[1]?.attributes.numbers).toBe('*3');
    });

    it('never emits a duplicated /print/print for any NAT operation', async () => {
      harness.existingRecord = managedRule;

      await withClient(async (client) => {
        await client.listNatRules();
        await client.findNatRuleById('*3');
        await client.enableNatRule({ id: '*3', kind: 'id' });
        await client.removeNatRule({ id: '*3', kind: 'id' });
      });

      for (const entry of harness.captured) {
        expect(entry.command).not.toContain('/print/print');
      }
    });
  });

  // =====================================================================
  // BOOLEANOS
  // =====================================================================
  describe('booleans', () => {
    const FLAGS = ['disabled', 'dynamic', 'invalid'] as const;

    it.each(FLAGS)('reads %s in both the true/false and the legacy yes/no form', async (flag) => {
      for (const raw of ['true', 'yes']) {
        harness.existingRecord = { '.id': '*1', action: 'masquerade', chain: 'srcnat', [flag]: raw };

        const rule = await withClient((client) => client.findNatRuleById('*1'));

        expect(rule?.[flag as keyof ObservedNatRule], `${flag}=${raw}`).toBe(true);
      }
    });

    it.each(FLAGS)('reads %s as false for "false", "no", an unknown value and an absent key', async (flag) => {
      for (const raw of ['false', 'no', 'maybe', undefined]) {
        harness.existingRecord = {
          '.id': '*1', action: 'masquerade', chain: 'srcnat',
          ...(raw !== undefined ? { [flag]: raw } : {}),
        };

        const rule = await withClient((client) => client.findNatRuleById('*1'));

        expect(rule?.[flag as keyof ObservedNatRule], `${flag}=${String(raw)}`).toBe(false);
      }
    });

    it('writes booleans in the yes/no form, never true/false', async () => {
      await withClient((client) =>
        client.createNatRule({
          action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:b', disabled: true,
        }),
      );

      expect(harness.captured[0]?.attributes.disabled).toBe('yes');
    });
  });

  // =====================================================================
  // TRAPS
  // =====================================================================
  describe('traps', () => {
    const TRAPS = [
      ['not found', 'no such item'],
      ['duplicate', 'failure: already have such entry'],
      ['invalid parameter', 'unknown parameter foo'],
      ['invalid chain', 'failure: chain does not exist'],
      ['invalid protocol', 'input does not match any value of protocol'],
      ['invalid interface', 'input does not match any value of interface'],
      ['action needs to-addresses', 'failure: to-addresses required for this action'],
    ] as const;

    it.each(TRAPS)('surfaces a "%s" trap verbatim from /add', async (_label, message) => {
      harness.trap = { forCommandEndingIn: '/add', message };

      await expect(
        withClient((client) =>
          client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:t' }),
        ),
      ).rejects.toThrow(message);
    });

    it('exposes the trap as RouterOSTrapError, so callers can map it by message', async () => {
      harness.trap = { category: '0', forCommandEndingIn: '/add', message: 'failure: already have such entry' };

      const error = await withClient((client) =>
        client
          .createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:t' })
          .then(() => null)
          .catch((caught: unknown) => caught),
      );

      expect((error as Error).name).toBe('RouterOSTrapError');
      expect((error as Error).message).toBe('failure: already have such entry');
    });

    it.each([['/set'], ['/move'], ['/enable'], ['/disable'], ['/remove']])(
      'propagates a trap raised by %s',
      async (suffix) => {
        harness.existingRecord = managedRule;
        harness.trap = { forCommandEndingIn: suffix, message: 'no such item' };
        const locator = { id: '*3', kind: 'id' } as const;

        const run = async (client: LibraryRouterOsClient): Promise<void> => {
          if (suffix === '/set') return client.updateNatRule(locator, { toPorts: '9090' });
          if (suffix === '/move') return client.moveNatRule(locator, { placeBeforeId: '*1' });
          if (suffix === '/enable') return client.enableNatRule(locator);
          if (suffix === '/disable') return client.disableNatRule(locator);
          return client.removeNatRule(locator);
        };

        await expect(withClient(run)).rejects.toThrow('no such item');
      },
    );

    it('propagates a trap raised by /print, instead of reporting an empty router', async () => {
      harness.trap = { forCommandEndingIn: '/print', message: 'not enough permissions' };

      await expect(withClient((client) => client.listNatRules())).rejects.toThrow('not enough permissions');
    });
  });
});
