import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObservedRawRule } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Certificacion de wire protocol para /ip/firewall/raw contra el framing binario real de
 * RouterOS. Fija comandos, atributos, selectores, `.proplist` y el mapeo de respuestas y de
 * traps que produce LibraryRouterOsClient.
 *
 * Las respuestas de referencia NO son inventadas: son las filas capturadas de un hEX con
 * RouterOS 7.21.4 durante la sonda de la Fase 0-bis, creando reglas deshabilitadas en
 * `prerouting` y releyendolas de inmediato.
 */
describe('LibraryRouterOsClient wire protocol (Firewall Raw)', () => {
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

  /** Capturada literalmente del router durante la sonda de la Fase 0-bis. */
  const probeRule = {
    '.id': '*14',
    action: 'accept',
    bytes: '0',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-raw:probe-p3',
    disabled: 'true',
    dynamic: 'false',
    invalid: 'false',
    packets: '0',
  };

  const commandsOf = () => harness.captured.map((entry) => entry.command);

  const MINIMAL_ADD = {
    action: 'drop',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-raw:min',
  } as const;

  /** Campos que Raw NO tiene: el router los rechaza con `unknown parameter <campo>`. */
  const FORBIDDEN_WIRE_NAMES = [
    'connection-state',
    'connection-mark',
    'routing-mark',
    'passthrough',
    'new-connection-mark',
    'new-packet-mark',
    'new-routing-mark',
    'routing-table',
    'notrack',
  ];

  // =====================================================================
  // PRINT
  // =====================================================================
  describe('PRINT', () => {
    it('listRawRules sends /ip/firewall/raw/print with no queries and no duplicated suffix', async () => {
      await withClient((client) => client.listRawRules());

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/raw/print');
      expect(harness.captured[0]?.queries).toEqual([]);
    });

    it('requests exactly the RAW_RULE_PROPLIST fields, in order', async () => {
      await withClient((client) => client.listRawRules());

      expect(harness.captured[0]?.attributes['.proplist']?.split(',')).toEqual([
        '.id', 'chain', 'action', 'disabled', 'dynamic', 'invalid', 'bytes', 'packets', 'comment',
        'protocol', 'src-address', 'dst-address', 'src-port', 'dst-port', 'in-interface',
        'out-interface', 'src-address-list', 'dst-address-list', 'tcp-flags', 'packet-mark',
        'log', 'log-prefix', 'jump-target', 'address-list', 'address-list-timeout',
      ]);
    });

    /**
     * Raw se ejecuta ANTES del connection tracking. La sonda de la Fase 0-bis comprobo uno
     * por uno que el router rechaza estos parametros con `unknown parameter <campo>`, asi
     * que pedirlos seria pedir campos inexistentes.
     */
    it('never asks for the conntrack fields Raw does not have', async () => {
      await withClient((client) => client.listRawRules());

      const proplist = harness.captured[0]?.attributes['.proplist']?.split(',') ?? [];
      for (const forbidden of FORBIDDEN_WIRE_NAMES) {
        expect(proplist, forbidden).not.toContain(forbidden);
      }
      // `packet-mark` SI existe en Raw: la asimetria es observada, no deducida.
      expect(proplist).toContain('packet-mark');
    });

    it('findRawRuleById selects with ?.id= and asks for the same proplist', async () => {
      harness.existingRecord = probeRule;

      await withClient((client) => client.findRawRuleById('*14'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/raw/print');
      expect(harness.captured[0]?.queries).toEqual(['?.id=*14']);
    });

    it('findRawRulesByReference lists everything and filters client-side, sending no query', async () => {
      harness.existingRecords = [probeRule];

      const found = await withClient((client) => client.findRawRulesByReference('probe-p3'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(found.map((rule) => rule.id)).toEqual(['*14']);
    });

    it('maps multiple replies preserving physical order', async () => {
      harness.existingRecords = [
        { ...probeRule, '.id': '*1', chain: 'prerouting' },
        { ...probeRule, '.id': '*2', chain: 'output' },
        { ...probeRule, '.id': '*5', chain: 'prerouting' },
      ];

      const rules = await withClient((client) => client.listRawRules());

      expect(rules.map((rule) => [rule.id, rule.physicalIndex, rule.chain])).toEqual([
        ['*1', 0, 'prerouting'],
        ['*2', 1, 'output'],
        ['*5', 2, 'prerouting'],
      ]);
    });

    it('returns empty results when the router reports no rules', async () => {
      harness.existingRecords = [];

      expect(await withClient((client) => client.listRawRules())).toEqual([]);
      expect(await withClient((client) => client.findRawRuleById('*99'))).toBeNull();
      expect(await withClient((client) => client.findRawRulesByReference('nada'))).toEqual([]);
    });

    it('maps the captured probe reply exactly as observed', async () => {
      harness.existingRecord = probeRule;

      const rule = await withClient((client) => client.findRawRuleById('*14'));

      expect(rule).toEqual({
        action: 'accept',
        bytes: 0,
        chain: 'prerouting',
        comment: 'cuzonet:firewall-raw:probe-p3',
        disabled: true,
        dynamic: false,
        id: '*14',
        invalid: false,
        ownership: { ruleReference: 'probe-p3', status: 'valid' },
        packets: 0,
      });
    });

    it('maps every modelled property of a full reply', async () => {
      harness.existingRecord = {
        '.id': '*7',
        action: 'add-src-to-address-list',
        'address-list': 'sospechosos',
        'address-list-timeout': '1h',
        bytes: '123456',
        chain: 'output',
        comment: 'cuzonet:firewall-raw:full-rule con detalle',
        disabled: 'false',
        'dst-address': '10.0.0.0/8',
        'dst-address-list': 'destinos',
        'dst-port': '443',
        dynamic: 'true',
        'in-interface': 'ether1',
        invalid: 'true',
        'jump-target': 'mi-chain',
        log: 'true',
        'log-prefix': 'RAW',
        'out-interface': 'ether2',
        'packet-mark': 'PM',
        packets: '789',
        protocol: 'tcp',
        'src-address': '192.168.1.0/24',
        'src-address-list': 'origenes',
        'src-port': '1024-65535',
        'tcp-flags': 'syn',
      };

      const rule = await withClient((client) => client.findRawRuleById('*7'));

      expect(rule).toMatchObject({
        action: 'add-src-to-address-list',
        addressList: 'sospechosos',
        addressListTimeout: '1h',
        bytes: 123456,
        chain: 'output',
        disabled: false,
        dstAddress: '10.0.0.0/8',
        dstAddressList: 'destinos',
        dstPort: '443',
        dynamic: true,
        inInterface: 'ether1',
        invalid: true,
        jumpTarget: 'mi-chain',
        log: true,
        logPrefix: 'RAW',
        outInterface: 'ether2',
        packetMark: 'PM',
        packets: 789,
        protocol: 'tcp',
        srcAddress: '192.168.1.0/24',
        srcAddressList: 'origenes',
        srcPort: '1024-65535',
        tcpFlags: 'syn',
      });
      expect(rule?.ownership).toEqual({
        ruleReference: 'full-rule',
        status: 'valid',
        userComment: 'con detalle',
      });
    });

    it('omits optional properties the router did not return', async () => {
      harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting' };

      const rule = await withClient((client) => client.findRawRuleById('*1'));

      for (const absent of [
        'protocol', 'srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface', 'outInterface',
        'srcAddressList', 'dstAddressList', 'tcpFlags', 'packetMark', 'log', 'logPrefix',
        'jumpTarget', 'addressList', 'addressListTimeout', 'comment',
      ]) {
        expect(rule, absent).not.toHaveProperty(absent);
      }
      expect(rule).toMatchObject({ bytes: 0, disabled: false, dynamic: false, invalid: false, packets: 0 });
      expect(rule?.ownership.status).toBe('unmanaged');
    });

    it('keeps an empty-string value instead of dropping it as falsy', async () => {
      harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting', 'src-address': '' };

      expect(await withClient((client) => client.findRawRuleById('*1'))).toHaveProperty('srcAddress', '');
    });

    it('findRawRuleById omits physicalIndex; a listing reports it', async () => {
      harness.existingRecord = { ...probeRule, '.id': '*42' };
      expect(await withClient((client) => client.findRawRuleById('*42'))).not.toHaveProperty('physicalIndex');

      harness.existingRecords = [{ ...probeRule, '.id': '*10' }, { ...probeRule, '.id': '*42' }];
      expect((await withClient((client) => client.listRawRules())).map((r) => r.physicalIndex)).toEqual([0, 1]);
    });
  });

  // =====================================================================
  // LOG — el campo que desaparece cuando es falso
  // =====================================================================
  describe('log', () => {
    /**
     * La sonda comprobo que el router OMITE `log` cuando es falso, incluso pidiendolo por
     * `.proplist`. Por eso Raw no necesita tabla de defaults: la ausencia en el estado real
     * y la ausencia en el deseado coinciden, al reves que `passthrough` en Mangle.
     */
    it('omits the property entirely when the router omits the field', async () => {
      harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting' };

      expect(await withClient((client) => client.findRawRuleById('*1'))).not.toHaveProperty('log');
    });

    it('maps the router value when present, in both boolean forms', async () => {
      for (const [raw, expected] of [['true', true], ['yes', true], ['false', false], ['no', false]] as const) {
        harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting', log: raw };

        const rule = await withClient((client) => client.findRawRuleById('*1'));

        expect(rule?.log, `log=${raw}`).toBe(expected);
      }
    });

    it('keeps an explicit false instead of collapsing it into absence', async () => {
      harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting', log: 'false' };

      const rule = await withClient((client) => client.findRawRuleById('*1'));

      expect(rule).toHaveProperty('log');
      expect(rule?.log).toBe(false);
    });

    it('writes log as the yes/no wire flag on add, in both directions, and omits it when undecided', async () => {
      await withClient(async (client) => {
        await client.createRawRule({ ...MINIMAL_ADD, log: true });
        await client.createRawRule({ ...MINIMAL_ADD, log: false });
        await client.createRawRule(MINIMAL_ADD);
      });

      expect(harness.captured[0]?.attributes.log).toBe('yes');
      expect(harness.captured[1]?.attributes.log).toBe('no');
      expect(harness.captured[2]?.attributes).not.toHaveProperty('log');
    });

    it('writes log on set, including an explicit false', async () => {
      harness.existingRecord = probeRule;

      await withClient((client) => client.updateRawRule({ id: '*14', kind: 'id' }, { log: false }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ log: 'no', numbers: '*14' });
    });
  });

  // =====================================================================
  // ADD
  // =====================================================================
  describe('ADD', () => {
    it('sends the minimum attributes for a minimal rule', async () => {
      await withClient((client) => client.createRawRule(MINIMAL_ADD));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/raw/add');
      expect(harness.captured[0]?.attributes).toEqual({
        action: 'drop',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-raw:min',
      });
    });

    it('serialises every attribute of a complete rule with RouterOS names', async () => {
      await withClient((client) =>
        client.createRawRule({
          action: 'add-src-to-address-list',
          addressList: 'sospechosos',
          addressListTimeout: '1h',
          chain: 'output',
          comment: 'cuzonet:firewall-raw:full',
          disabled: false,
          dstAddress: '10.0.0.0/8',
          dstAddressList: 'destinos',
          dstPort: '443',
          inInterface: 'ether1',
          jumpTarget: 'mi-chain',
          log: true,
          logPrefix: 'RAW',
          outInterface: 'ether2',
          packetMark: 'PM',
          protocol: 'tcp',
          srcAddress: '192.168.1.0/24',
          srcAddressList: 'origenes',
          srcPort: '1024-65535',
          tcpFlags: 'syn',
        }),
      );

      expect(harness.captured[0]?.attributes).toEqual({
        action: 'add-src-to-address-list',
        'address-list': 'sospechosos',
        'address-list-timeout': '1h',
        chain: 'output',
        comment: 'cuzonet:firewall-raw:full',
        disabled: 'no',
        'dst-address': '10.0.0.0/8',
        'dst-address-list': 'destinos',
        'dst-port': '443',
        'in-interface': 'ether1',
        'jump-target': 'mi-chain',
        log: 'yes',
        'log-prefix': 'RAW',
        'out-interface': 'ether2',
        'packet-mark': 'PM',
        protocol: 'tcp',
        'src-address': '192.168.1.0/24',
        'src-address-list': 'origenes',
        'src-port': '1024-65535',
        'tcp-flags': 'syn',
      });
    });

    it('never sends a field Raw does not have, however complete the rule is', async () => {
      await withClient((client) =>
        client.createRawRule({
          ...MINIMAL_ADD,
          packetMark: 'PM',
          protocol: 'tcp',
          srcAddress: '10.0.0.0/8',
        }),
      );

      for (const forbidden of FORBIDDEN_WIRE_NAMES) {
        expect(harness.captured[0]?.attributes, forbidden).not.toHaveProperty(forbidden);
      }
    });

    it('writes disabled as the yes/no wire flag in both directions, and omits it when undecided', async () => {
      await withClient(async (client) => {
        await client.createRawRule({ ...MINIMAL_ADD, disabled: true });
        await client.createRawRule({ ...MINIMAL_ADD, disabled: false });
        await client.createRawRule(MINIMAL_ADD);
      });

      expect(harness.captured[0]?.attributes.disabled).toBe('yes');
      expect(harness.captured[1]?.attributes.disabled).toBe('no');
      expect(harness.captured[2]?.attributes).not.toHaveProperty('disabled');
    });

    it('sends place-before when requested and omits it otherwise', async () => {
      await withClient(async (client) => {
        await client.createRawRule({ ...MINIMAL_ADD, placeBeforeId: '*4' });
        await client.createRawRule(MINIMAL_ADD);
      });

      expect(harness.captured[0]?.attributes['place-before']).toBe('*4');
      expect(harness.captured[1]?.attributes).not.toHaveProperty('place-before');
    });

    it('sends jump-target for a jump rule and address-list for the list actions', async () => {
      await withClient(async (client) => {
        await client.createRawRule({ ...MINIMAL_ADD, action: 'jump', jumpTarget: 'mi-chain' });
        await client.createRawRule({
          ...MINIMAL_ADD,
          action: 'add-dst-to-address-list',
          addressList: 'destinos',
          addressListTimeout: '30m',
        });
      });

      expect(harness.captured[0]?.attributes).toMatchObject({ action: 'jump', 'jump-target': 'mi-chain' });
      expect(harness.captured[1]?.attributes).toMatchObject({
        action: 'add-dst-to-address-list',
        'address-list': 'destinos',
        'address-list-timeout': '30m',
      });
    });
  });

  // =====================================================================
  // SET
  // =====================================================================
  describe('SET', () => {
    beforeEach(() => {
      harness.existingRecord = probeRule;
    });

    it('sends only the changed attributes, always with =numbers=', async () => {
      await withClient((client) => client.updateRawRule({ id: '*14', kind: 'id' }, { protocol: 'udp' }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.command).toBe('/ip/firewall/raw/set');
      expect(set?.attributes).toEqual({ numbers: '*14', protocol: 'udp' });
    });

    it('never sends a field the caller did not ask to change', async () => {
      await withClient((client) => client.updateRawRule({ id: '*14', kind: 'id' }, { protocol: 'udp' }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      for (const untouched of [
        'action', 'chain', 'comment', 'disabled', 'dst-address', 'dst-address-list', 'dst-port',
        'in-interface', 'log', 'log-prefix', 'out-interface', 'packet-mark', 'src-address',
        'src-address-list', 'src-port', 'tcp-flags', 'jump-target', 'address-list',
        'address-list-timeout', ...FORBIDDEN_WIRE_NAMES,
      ]) {
        expect(set?.attributes, untouched).not.toHaveProperty(untouched);
      }
    });

    it('preserves both booleans, sending true as yes and false as no', async () => {
      await withClient(async (client) => {
        await client.updateRawRule({ id: '*14', kind: 'id' }, { disabled: true, log: true });
        await client.updateRawRule({ id: '*14', kind: 'id' }, { disabled: false, log: false });
      });

      const sets = harness.captured.filter((entry) => entry.command.endsWith('/set'));
      expect(sets[0]?.attributes).toEqual({ disabled: 'yes', log: 'yes', numbers: '*14' });
      expect(sets[1]?.attributes).toEqual({ disabled: 'no', log: 'no', numbers: '*14' });
    });

    it('sends no /set at all when the update carries no fields', async () => {
      await withClient((client) => client.updateRawRule({ id: '*14', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print']);
    });

    it('clears a field by sending it explicitly as an empty string', async () => {
      await withClient((client) =>
        client.updateRawRule({ id: '*14', kind: 'id' }, { logPrefix: '', srcAddress: '' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ 'log-prefix': '', numbers: '*14', 'src-address': '' });
    });

    it('resolves a managed-reference locator through a full listing before setting', async () => {
      await withClient((client) =>
        client.updateRawRule({ kind: 'managed-reference', ruleReference: 'probe-p3' }, { protocol: 'udp' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print', '/ip/firewall/raw/set']);
      expect(harness.captured[1]?.attributes.numbers).toBe('*14');
    });

    it('sends chain, action and comment when the patch declares them', async () => {
      await withClient((client) =>
        client.updateRawRule(
          { id: '*14', kind: 'id' },
          { action: 'accept', chain: 'output', comment: 'cuzonet:firewall-raw:probe-p3 nuevo' },
        ),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({
        action: 'accept',
        chain: 'output',
        comment: 'cuzonet:firewall-raw:probe-p3 nuevo',
        numbers: '*14',
      });
    });
  });

  // =====================================================================
  // MOVE
  // =====================================================================
  describe('MOVE', () => {
    beforeEach(() => {
      harness.existingRecord = probeRule;
    });

    it('moves before another rule using its .id as destination', async () => {
      await withClient((client) => client.moveRawRule({ id: '*14', kind: 'id' }, { placeBeforeId: '*1' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.command).toBe('/ip/firewall/raw/move');
      expect(move?.attributes).toEqual({ destination: '*1', numbers: '*14' });
    });

    /**
     * `destination` coloca ANTES del elemento en esa posicion, asi que ningun indice expresa
     * "al final": con N reglas los indices validos son 0..N-1. Verificado contra RouterOS
     * 7.21.4 — `destination=N` responde `no such item`. La forma correcta es OMITIR el
     * atributo, y Raw nace ya con ella.
     */
    it('moves to the end by omitting destination entirely', async () => {
      harness.existingRecords = [
        { ...probeRule, '.id': '*14' },
        { ...probeRule, '.id': '*1' },
        { ...probeRule, '.id': '*2' },
      ];

      await withClient((client) => client.moveRawRule({ id: '*14', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print', '/ip/firewall/raw/move']);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*14' });
      expect(harness.captured[1]?.attributes).not.toHaveProperty('destination');
    });

    it('never sends a numeric destination, which the router rejects as out of range', async () => {
      harness.existingRecords = [{ ...probeRule, '.id': '*14' }, { ...probeRule, '.id': '*1' }];

      await withClient(async (client) => {
        await client.moveRawRule({ id: '*14', kind: 'id' }, {});
        await client.moveRawRule({ id: '*14', kind: 'id' }, { placeBeforeId: '*1' });
      });

      for (const move of harness.captured.filter((e) => e.command.endsWith('/move'))) {
        if (move.attributes.destination !== undefined) {
          expect(move.attributes.destination).toMatch(/^\*/);
        }
      }
    });

    it('does nothing when the rule to move does not exist', async () => {
      harness.existingRecords = [];

      await withClient((client) => client.moveRawRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' }));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print']);
    });

    it('sends an unknown destination verbatim instead of silently appending', async () => {
      await withClient((client) => client.moveRawRule({ id: '*14', kind: 'id' }, { placeBeforeId: '*404' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.attributes).toEqual({ destination: '*404', numbers: '*14' });
    });

    it('resolves a managed-reference locator through a full listing before moving', async () => {
      harness.existingRecords = [{ ...probeRule, '.id': '*9' }];

      await withClient((client) =>
        client.moveRawRule({ kind: 'managed-reference', ruleReference: 'probe-p3' }, { placeBeforeId: '*1' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print', '/ip/firewall/raw/move']);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(harness.captured[1]?.attributes).toEqual({ destination: '*1', numbers: '*9' });
    });
  });

  // =====================================================================
  // ENABLE / DISABLE / REMOVE
  // =====================================================================
  describe('ENABLE, DISABLE and REMOVE', () => {
    const CASES = [
      ['enableRawRule', '/ip/firewall/raw/enable'],
      ['disableRawRule', '/ip/firewall/raw/disable'],
      ['removeRawRule', '/ip/firewall/raw/remove'],
    ] as const;

    it.each(CASES)('%s resolves the rule and sends %s with =numbers=', async (method, command) => {
      harness.existingRecord = probeRule;

      await withClient((client) => client[method]({ id: '*14', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print', command]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*14' });
    });

    it.each(CASES)('%s resolves a managed-reference locator through a full listing', async (method, command) => {
      harness.existingRecords = [{ ...probeRule, '.id': '*9' }];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'probe-p3' }));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print', command]);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*9' });
    });

    it.each(CASES)('%s does nothing when the rule does not exist', async (method) => {
      harness.existingRecords = [];

      await withClient((client) => client[method]({ id: '*99', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print']);
    });

    it.each(CASES)('%s does nothing when the managed reference matches no rule', async (method) => {
      harness.existingRecords = [{ ...probeRule, comment: 'cuzonet:firewall-raw:otra' }];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'probe-p3' }));

      expect(commandsOf()).toEqual(['/ip/firewall/raw/print']);
    });

    it('never emits a duplicated /print/print for any Raw operation', async () => {
      harness.existingRecord = probeRule;

      await withClient(async (client) => {
        await client.listRawRules();
        await client.findRawRuleById('*14');
        await client.enableRawRule({ id: '*14', kind: 'id' });
        await client.removeRawRule({ id: '*14', kind: 'id' });
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
        harness.existingRecord = { '.id': '*1', action: 'accept', chain: 'prerouting', [flag]: raw };

        const rule = await withClient((client) => client.findRawRuleById('*1'));

        expect(rule?.[flag as keyof ObservedRawRule], `${flag}=${raw}`).toBe(true);
      }
    });

    it.each(FLAGS)('reads %s as false for "false", "no", an unknown value and an absent key', async (flag) => {
      for (const raw of ['false', 'no', 'maybe', undefined]) {
        harness.existingRecord = {
          '.id': '*1', action: 'accept', chain: 'prerouting',
          ...(raw !== undefined ? { [flag]: raw } : {}),
        };

        const rule = await withClient((client) => client.findRawRuleById('*1'));

        expect(rule?.[flag as keyof ObservedRawRule], `${flag}=${String(raw)}`).toBe(false);
      }
    });
  });

  // =====================================================================
  // TRAPS
  // =====================================================================
  describe('traps', () => {
    const addRule = (client: LibraryRouterOsClient) => client.createRawRule(MINIMAL_ADD);

    /**
     * Los dos primeros son los CAPTURADOS del router en la sonda de la Fase 0-bis: una accion
     * inexistente y un parametro que Raw no tiene. El resto reproduce la forma de las demas
     * familias de error. Lo certificado es la propagacion verbatim, no la redaccion.
     */
    const TRAPS = [
      ['invalid action', 'input does not match any value of action'],
      ['unknown parameter', 'unknown parameter connection-state'],
      ['not found', 'no such item'],
      ['duplicate', 'failure: already have such entry'],
      ['generic failure', 'failure'],
      ['invalid protocol', 'input does not match any value of protocol'],
      ['invalid interface', 'input does not match any value of in-interface'],
    ] as const;

    it.each(TRAPS)('surfaces a "%s" trap verbatim from /add, as RouterOSTrapError', async (_label, message) => {
      harness.trap = { forCommandEndingIn: '/add', message };

      const error = await withClient((client) =>
        addRule(client).then(() => null).catch((caught: unknown) => caught),
      );

      expect((error as Error).name).toBe('RouterOSTrapError');
      expect((error as Error).message).toBe(message);
    });

    it.each([['/set'], ['/move'], ['/enable'], ['/disable'], ['/remove']])(
      'propagates a trap raised by %s',
      async (suffix) => {
        harness.existingRecord = probeRule;
        harness.trap = { forCommandEndingIn: suffix, message: 'no such item' };
        const locator = { id: '*14', kind: 'id' } as const;

        const run = async (client: LibraryRouterOsClient): Promise<void> => {
          if (suffix === '/set') return client.updateRawRule(locator, { protocol: 'udp' });
          if (suffix === '/move') return client.moveRawRule(locator, { placeBeforeId: '*1' });
          if (suffix === '/enable') return client.enableRawRule(locator);
          if (suffix === '/disable') return client.disableRawRule(locator);
          return client.removeRawRule(locator);
        };

        await expect(withClient(run)).rejects.toThrow('no such item');
      },
    );

    it('propagates a trap raised by /print, instead of reporting an empty router', async () => {
      harness.trap = { forCommandEndingIn: '/print', message: 'not enough permissions' };

      await expect(withClient((client) => client.listRawRules())).rejects.toThrow('not enough permissions');
    });
  });
});
