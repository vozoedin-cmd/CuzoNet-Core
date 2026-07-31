import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObservedFilterRule } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Certificacion de wire protocol para /ip/firewall/filter contra el framing binario real
 * de RouterOS. Fija los comandos, los atributos, los selectores, el `.proplist` y el
 * mapeo de respuestas y de traps que produce LibraryRouterOsClient.
 *
 * No introduce capacidades: solo describe y bloquea lo que el cliente hace hoy.
 */
describe('LibraryRouterOsClient wire protocol (Firewall Filter)', () => {
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

  /** Respuesta con la forma que devuelve RouterOS 7.21.4 para una regla administrada. */
  const managedRule = {
    '.id': '*3',
    action: 'drop',
    bytes: '4096',
    chain: 'input',
    comment: 'cuzonet:firewall-filter:block-ssh-wan bloqueo SSH',
    disabled: 'false',
    dynamic: 'false',
    invalid: 'false',
    packets: '32',
    protocol: 'tcp',
  };

  const commandsOf = () => harness.captured.map((entry) => entry.command);

  // =====================================================================
  // PRINT
  // =====================================================================
  describe('PRINT', () => {
    it('listFilterRules sends /ip/firewall/filter/print with no queries and no duplicated suffix', async () => {
      await withClient((client) => client.listFilterRules());

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/filter/print');
      expect(harness.captured[0]?.queries).toEqual([]);
    });

    it('requests exactly the FILTER_RULE_PROPLIST fields, in order', async () => {
      await withClient((client) => client.listFilterRules());

      expect(harness.captured[0]?.attributes['.proplist']?.split(',')).toEqual([
        '.id', 'chain', 'action', 'protocol', 'src-address', 'dst-address', 'src-port', 'dst-port',
        'in-interface', 'out-interface', 'connection-state', 'disabled', 'comment', 'dynamic',
        'invalid', 'jump-target', 'reject-with', 'hotspot', 'log', 'log-prefix', 'address-list',
        'bytes', 'packets',
      ]);
    });

    it('findFilterRuleById selects with ?.id= and asks for the same proplist', async () => {
      harness.existingRecord = managedRule;

      await withClient((client) => client.findFilterRuleById('*3'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/filter/print');
      expect(harness.captured[0]?.queries).toEqual(['?.id=*3']);
    });

    it('findFilterRulesByReference lists everything and filters client-side, sending no query', async () => {
      harness.existingRecords = [managedRule];

      const found = await withClient((client) => client.findFilterRulesByReference('block-ssh-wan'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/filter/print');
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(found.map((rule) => rule.id)).toEqual(['*3']);
    });

    it('maps multiple replies preserving physical order', async () => {
      harness.existingRecords = [
        { ...managedRule, '.id': '*1', chain: 'input' },
        { ...managedRule, '.id': '*2', chain: 'forward' },
        { ...managedRule, '.id': '*5', chain: 'output' },
      ];

      const rules = await withClient((client) => client.listFilterRules());

      expect(rules.map((rule) => [rule.id, rule.physicalIndex, rule.chain])).toEqual([
        ['*1', 0, 'input'],
        ['*2', 1, 'forward'],
        ['*5', 2, 'output'],
      ]);
    });

    it('returns an empty list when the router reports no rules', async () => {
      harness.existingRecords = [];

      expect(await withClient((client) => client.listFilterRules())).toEqual([]);
    });

    it('returns null from findFilterRuleById when there are no results', async () => {
      harness.existingRecords = [];

      expect(await withClient((client) => client.findFilterRuleById('*99'))).toBeNull();
    });

    it('returns an empty array from findFilterRulesByReference when nothing matches', async () => {
      harness.existingRecords = [managedRule];

      expect(await withClient((client) => client.findFilterRulesByReference('otra-cosa'))).toEqual([]);
    });

    it('maps every modelled property of a full reply', async () => {
      harness.existingRecord = {
        '.id': '*7',
        action: 'jump',
        'address-list': 'MOROSOS',
        bytes: '123456',
        chain: 'forward',
        comment: 'cuzonet:firewall-filter:full-rule con detalle',
        'connection-state': 'new,established',
        disabled: 'true',
        'dst-address': '10.0.0.0/8',
        'dst-port': '443',
        dynamic: 'true',
        hotspot: 'auth',
        'in-interface': 'ether1',
        invalid: 'true',
        'jump-target': 'custom-chain',
        log: 'true',
        'log-prefix': 'CUZONET',
        'out-interface': 'ether2',
        packets: '789',
        protocol: 'tcp',
        'reject-with': 'icmp-net-unreachable',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
      };

      const rule = await withClient((client) => client.findFilterRuleById('*7'));

      expect(rule).toMatchObject({
        action: 'jump',
        addressList: 'MOROSOS',
        bytes: 123456,
        chain: 'forward',
        connectionState: 'new,established',
        disabled: true,
        dstAddress: '10.0.0.0/8',
        dstPort: '443',
        dynamic: true,
        hotspot: 'auth',
        id: '*7',
        inInterface: 'ether1',
        invalid: true,
        jumpTarget: 'custom-chain',
        log: true,
        logPrefix: 'CUZONET',
        outInterface: 'ether2',
        packets: 789,
        protocol: 'tcp',
        rejectWith: 'icmp-net-unreachable',
        srcAddress: '192.168.1.0/24',
        srcPort: '1024-65535',
      });
      expect(rule?.ownership.ruleReference).toBe('full-rule');
    });

    it('omits optional properties the router did not return, instead of emitting empty strings', async () => {
      harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'input' };

      const rule = await withClient((client) => client.findFilterRuleById('*1'));

      for (const absent of [
        'protocol', 'srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface',
        'outInterface', 'connectionState', 'jumpTarget', 'rejectWith', 'hotspot',
        'logPrefix', 'addressList', 'comment',
      ]) {
        expect(rule, absent).not.toHaveProperty(absent);
      }
      // Los contadores y los booleanos si tienen valor por defecto.
      expect(rule).toMatchObject({ bytes: 0, disabled: false, dynamic: false, invalid: false, log: false, packets: 0 });
    });

    /**
     * DIVERGENCIA CONOCIDA: al resolver por `.id` el cliente mapea con indice 0 fijo, asi
     * que `physicalIndex` no refleja la posicion real de la regla en la cadena. El doble,
     * que conoce el array completo, si devuelve la posicion real. Ver el informe.
     */
    it('GAP: findFilterRuleById always reports physicalIndex 0, whatever the real position', async () => {
      harness.existingRecord = { ...managedRule, '.id': '*42' };

      const rule = await withClient((client) => client.findFilterRuleById('*42'));

      expect(rule?.physicalIndex).toBe(0);
    });
  });

  // =====================================================================
  // ADD
  // =====================================================================
  describe('ADD', () => {
    it('sends the minimum attributes for a minimal rule', async () => {
      await withClient((client) =>
        client.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:min' }),
      );

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/filter/add');
      expect(harness.captured[0]?.attributes).toEqual({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:min',
      });
    });

    it('serialises every match attribute of a complete rule with RouterOS names', async () => {
      await withClient((client) =>
        client.createFilterRule({
          action: 'accept',
          chain: 'forward',
          comment: 'cuzonet:firewall-filter:full',
          connectionState: 'established,related',
          disabled: false,
          dstAddress: '10.0.0.0/8',
          dstPort: '443',
          inInterface: 'ether1',
          outInterface: 'ether2',
          protocol: 'tcp',
          srcAddress: '192.168.1.0/24',
          srcPort: '1024-65535',
        }),
      );

      expect(harness.captured[0]?.attributes).toEqual({
        action: 'accept',
        chain: 'forward',
        comment: 'cuzonet:firewall-filter:full',
        'connection-state': 'established,related',
        disabled: 'no',
        'dst-address': '10.0.0.0/8',
        'dst-port': '443',
        'in-interface': 'ether1',
        'out-interface': 'ether2',
        protocol: 'tcp',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
      });
    });

    it('sends place-before when the rule must be inserted at a position', async () => {
      await withClient((client) =>
        client.createFilterRule({
          action: 'drop',
          chain: 'input',
          comment: 'cuzonet:firewall-filter:placed',
          placeBeforeId: '*4',
        }),
      );

      expect(harness.captured[0]?.attributes['place-before']).toBe('*4');
    });

    it('omits place-before when appending at the end', async () => {
      await withClient((client) =>
        client.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:appended' }),
      );

      expect(harness.captured[0]?.attributes).not.toHaveProperty('place-before');
    });

    it('omits disabled entirely when the caller does not decide it', async () => {
      await withClient((client) =>
        client.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:x' }),
      );

      expect(harness.captured[0]?.attributes).not.toHaveProperty('disabled');
    });

    /**
     * `ManagedFilterRuleSpec` declara jumpTarget, rejectWith, hotspot, log, logPrefix y
     * addressList, y el mapeo de lectura los interpreta. El cliente los serializa con sus
     * nombres RouterOS. `address-list` es el parametro de destino de las acciones
     * add-src-to-address-list / add-dst-to-address-list, no un criterio de match.
     */
    it('serialises jumpTarget, rejectWith, hotspot, log, logPrefix and addressList', async () => {
      await withClient((client) =>
        client.createFilterRule({
          action: 'jump',
          addressList: 'MOROSOS',
          chain: 'input',
          comment: 'cuzonet:firewall-filter:extended',
          hotspot: 'auth',
          jumpTarget: 'custom-chain',
          log: true,
          logPrefix: 'CUZONET',
          rejectWith: 'icmp-net-unreachable',
        }),
      );

      expect(harness.captured[0]?.attributes).toEqual({
        action: 'jump',
        'address-list': 'MOROSOS',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:extended',
        hotspot: 'auth',
        'jump-target': 'custom-chain',
        log: 'yes',
        'log-prefix': 'CUZONET',
        'reject-with': 'icmp-net-unreachable',
      });
    });

    it('omits each extended attribute the caller left undefined', async () => {
      await withClient((client) =>
        client.createFilterRule({
          action: 'drop',
          chain: 'input',
          comment: 'cuzonet:firewall-filter:bare',
        }),
      );

      for (const attribute of ['jump-target', 'reject-with', 'hotspot', 'log', 'log-prefix', 'address-list']) {
        expect(harness.captured[0]?.attributes, attribute).not.toHaveProperty(attribute);
      }
    });

    it('writes log as the yes/no wire flag, in both directions', async () => {
      await withClient(async (client) => {
        await client.createFilterRule({ action: 'drop', chain: 'input', comment: 'a', log: true });
        await client.createFilterRule({ action: 'drop', chain: 'input', comment: 'b', log: false });
      });

      expect(harness.captured[0]?.attributes.log).toBe('yes');
      expect(harness.captured[1]?.attributes.log).toBe('no');
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
      await withClient((client) =>
        client.updateFilterRule({ id: '*3', kind: 'id' }, { protocol: 'udp' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.command).toBe('/ip/firewall/filter/set');
      expect(set?.attributes).toEqual({ numbers: '*3', protocol: 'udp' });
    });

    it('never sends attributes the caller omitted', async () => {
      await withClient((client) =>
        client.updateFilterRule({ id: '*3', kind: 'id' }, { comment: 'nuevo', dstPort: '8080' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ comment: 'nuevo', 'dst-port': '8080', numbers: '*3' });
    });

    it('sends no /set at all when the update carries no fields', async () => {
      await withClient((client) => client.updateFilterRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print']);
    });

    it('clears a field by sending it explicitly as an empty string', async () => {
      await withClient((client) =>
        client.updateFilterRule({ id: '*3', kind: 'id' }, { comment: '', srcAddress: '' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ comment: '', numbers: '*3', 'src-address': '' });
    });

    it('serialises disabled as the yes/no wire flag', async () => {
      await withClient(async (client) => {
        await client.updateFilterRule({ id: '*3', kind: 'id' }, { disabled: true });
        await client.updateFilterRule({ id: '*3', kind: 'id' }, { disabled: false });
      });

      const sets = harness.captured.filter((entry) => entry.command.endsWith('/set'));
      expect(sets[0]?.attributes.disabled).toBe('yes');
      expect(sets[1]?.attributes.disabled).toBe('no');
    });

    it('sends the extended attributes on /set with their RouterOS names', async () => {
      await withClient((client) =>
        client.updateFilterRule(
          { id: '*3', kind: 'id' },
          {
            addressList: 'MOROSOS',
            hotspot: 'auth',
            jumpTarget: 'custom-chain',
            log: false,
            logPrefix: 'CUZONET',
            rejectWith: 'icmp-net-unreachable',
          },
        ),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({
        'address-list': 'MOROSOS',
        hotspot: 'auth',
        'jump-target': 'custom-chain',
        log: 'no',
        'log-prefix': 'CUZONET',
        numbers: '*3',
        'reject-with': 'icmp-net-unreachable',
      });
    });

    it('still sends no /set when only extended attributes are omitted', async () => {
      await withClient((client) => client.updateFilterRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print']);
    });

    it('resolves a managed-reference locator through a full listing before setting', async () => {
      await withClient((client) =>
        client.updateFilterRule({ kind: 'managed-reference', ruleReference: 'block-ssh-wan' }, { protocol: 'udp' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print', '/ip/firewall/filter/set']);
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
      await withClient((client) =>
        client.moveFilterRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*1' }),
      );

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.command).toBe('/ip/firewall/filter/move');
      expect(move?.attributes).toEqual({ destination: '*1', numbers: '*3' });
    });

    it('moves to the end by counting the rules and using that count as destination', async () => {
      // El arnes no filtra por query, asi que la fila a resolver va primero para que la
      // resolucion por ?.id= sea inequivoca; el conteo sigue siendo 3.
      harness.existingRecords = [
        { ...managedRule, '.id': '*3' },
        { ...managedRule, '.id': '*1' },
        { ...managedRule, '.id': '*2' },
      ];

      await withClient((client) => client.moveFilterRule({ id: '*3', kind: 'id' }, {}));

      // Resolucion + listado completo para contar + move: tres viajes.
      expect(commandsOf()).toEqual([
        '/ip/firewall/filter/print',
        '/ip/firewall/filter/print',
        '/ip/firewall/filter/move',
      ]);
      const move = harness.captured[2];
      expect(move?.attributes).toEqual({ destination: '3', numbers: '*3' });
    });

    it('does nothing when the rule to move does not exist', async () => {
      harness.existingRecords = [];

      await withClient((client) => client.moveFilterRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' }));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print']);
    });

    it('does not validate the destination: an unknown target is forwarded to the router as-is', async () => {
      await withClient((client) =>
        client.moveFilterRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*999' }),
      );

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.attributes.destination).toBe('*999');
    });
  });

  // =====================================================================
  // ENABLE / DISABLE / REMOVE
  // =====================================================================
  describe('ENABLE, DISABLE and REMOVE', () => {
    const CASES = [
      ['enableFilterRule', '/ip/firewall/filter/enable'],
      ['disableFilterRule', '/ip/firewall/filter/disable'],
      ['removeFilterRule', '/ip/firewall/filter/remove'],
    ] as const;

    it.each(CASES)('%s resolves the rule and sends %s with =numbers=', async (method, command) => {
      harness.existingRecord = managedRule;

      await withClient((client) => client[method]({ id: '*3', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print', command]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*3' });
    });

    it.each(CASES)('%s does nothing when the rule does not exist', async (method) => {
      harness.existingRecords = [];

      await withClient((client) => client[method]({ id: '*99', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print']);
    });

    it.each(CASES)('%s accepts a managed-reference locator', async (method, command) => {
      harness.existingRecords = [managedRule];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'block-ssh-wan' }));

      expect(commandsOf()).toEqual(['/ip/firewall/filter/print', command]);
      expect(harness.captured[1]?.attributes.numbers).toBe('*3');
    });
  });

  // =====================================================================
  // BOOLEANOS
  // =====================================================================
  describe('booleans', () => {
    const FLAGS = ['disabled', 'dynamic', 'invalid', 'log'] as const;

    it.each(FLAGS)('reads %s in the true/false form RouterOS 7.21.4 returns', async (flag) => {
      harness.existingRecord = { '.id': '*1', action: 'drop', chain: 'input', [flag]: 'true' };

      const rule = await withClient((client) => client.findFilterRuleById('*1'));

      expect(rule?.[flag as keyof ObservedFilterRule]).toBe(true);
    });

    it.each(FLAGS)('reads %s in the legacy yes/no form as well', async (flag) => {
      harness.existingRecord = { '.id': '*1', action: 'drop', chain: 'input', [flag]: 'yes' };

      const rule = await withClient((client) => client.findFilterRuleById('*1'));

      expect(rule?.[flag as keyof ObservedFilterRule]).toBe(true);
    });

    it.each(FLAGS)('reads %s as false for "false", "no", an unknown value and an absent key', async (flag) => {
      for (const raw of ['false', 'no', 'maybe', undefined]) {
        harness.existingRecord = {
          '.id': '*1', action: 'drop', chain: 'input',
          ...(raw !== undefined ? { [flag]: raw } : {}),
        };

        const rule = await withClient((client) => client.findFilterRuleById('*1'));

        expect(rule?.[flag as keyof ObservedFilterRule], `${flag}=${String(raw)}`).toBe(false);
      }
    });

    it('writes booleans in the yes/no form, never true/false', async () => {
      await withClient((client) =>
        client.createFilterRule({
          action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:b', disabled: true,
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
    ] as const;

    it.each(TRAPS)('surfaces a "%s" trap verbatim from /add', async (_label, message) => {
      harness.trap = { forCommandEndingIn: '/add', message };

      await expect(
        withClient((client) =>
          client.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:t' }),
        ),
      ).rejects.toThrow(message);
    });

    it('exposes the trap as RouterOSTrapError, so callers can map it by message', async () => {
      harness.trap = { category: '0', forCommandEndingIn: '/add', message: 'failure: already have such entry' };

      const error = await withClient((client) =>
        client
          .createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:t' })
          .then(() => null)
          .catch((caught: unknown) => caught),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('RouterOSTrapError');
      expect((error as Error).message).toBe('failure: already have such entry');
    });

    it('propagates a trap raised by /set', async () => {
      harness.existingRecord = managedRule;
      harness.trap = { forCommandEndingIn: '/set', message: 'unknown parameter foo' };

      await expect(
        withClient((client) => client.updateFilterRule({ id: '*3', kind: 'id' }, { protocol: 'udp' })),
      ).rejects.toThrow('unknown parameter foo');
    });

    it('propagates a trap raised by /move', async () => {
      harness.existingRecord = managedRule;
      harness.trap = { forCommandEndingIn: '/move', message: 'no such item' };

      await expect(
        withClient((client) => client.moveFilterRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*999' })),
      ).rejects.toThrow('no such item');
    });

    it.each([['/enable'], ['/disable'], ['/remove']])('propagates a trap raised by %s', async (suffix) => {
      harness.existingRecord = managedRule;
      harness.trap = { forCommandEndingIn: suffix, message: 'no such item' };
      const method = ({
        '/disable': 'disableFilterRule',
        '/enable': 'enableFilterRule',
        '/remove': 'removeFilterRule',
      } as const)[suffix as '/enable' | '/disable' | '/remove'];

      await expect(
        withClient((client) => client[method]({ id: '*3', kind: 'id' })),
      ).rejects.toThrow('no such item');
    });

    it('propagates a trap raised by /print, instead of reporting an empty router', async () => {
      harness.trap = { forCommandEndingIn: '/print', message: 'not enough permissions' };

      await expect(withClient((client) => client.listFilterRules())).rejects.toThrow(
        'not enough permissions',
      );
    });
  });
});
