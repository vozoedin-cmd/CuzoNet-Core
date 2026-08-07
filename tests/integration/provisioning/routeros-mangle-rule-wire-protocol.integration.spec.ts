import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObservedMangleRule } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Certificacion de wire protocol para /ip/firewall/mangle contra el framing binario real
 * de RouterOS. Fija comandos, atributos, selectores, `.proplist` y el mapeo de respuestas
 * y de traps que produce LibraryRouterOsClient.
 *
 * Las respuestas de referencia no son inventadas: se capturaron de un hEX con RouterOS
 * 7.21.4 durante la sonda de la Fase 0, creando reglas deshabilitadas en `prerouting` y
 * releyendolas de inmediato.
 */
describe('LibraryRouterOsClient wire protocol (Firewall Mangle)', () => {
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

  /** Capturada literalmente del router durante la sonda de la Fase 0. */
  const probeConnRule = {
    '.id': '*3',
    action: 'mark-connection',
    bytes: '0',
    chain: 'prerouting',
    comment: 'cuzonet:firewall-mangle:probe-conn',
    disabled: 'true',
    dynamic: 'false',
    invalid: 'false',
    'new-connection-mark': 'CUZONET_PROBE_CONN',
    packets: '0',
    passthrough: 'true',
  };

  const commandsOf = () => harness.captured.map((entry) => entry.command);

  // =====================================================================
  // PRINT
  // =====================================================================
  describe('PRINT', () => {
    it('listMangleRules sends /ip/firewall/mangle/print with no queries and no duplicated suffix', async () => {
      await withClient((client) => client.listMangleRules());

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/mangle/print');
      expect(harness.captured[0]?.queries).toEqual([]);
    });

    it('requests exactly the MANGLE_RULE_PROPLIST fields, in order', async () => {
      await withClient((client) => client.listMangleRules());

      expect(harness.captured[0]?.attributes['.proplist']?.split(',')).toEqual([
        '.id', 'chain', 'action', 'protocol', 'src-address', 'dst-address', 'src-port',
        'dst-port', 'in-interface', 'out-interface', 'connection-state', 'connection-mark',
        'packet-mark', 'routing-mark', 'new-connection-mark', 'new-packet-mark',
        'new-routing-mark', 'passthrough', 'disabled', 'comment', 'dynamic', 'invalid',
        'bytes', 'packets',
      ]);
    });

    /** Observado en la Fase 0: el router devuelve `new-routing-mark`, nunca `routing-table`. */
    it('never asks for routing-table, the naming the router does not use here', async () => {
      await withClient((client) => client.listMangleRules());

      const proplist = harness.captured[0]?.attributes['.proplist']?.split(',') ?? [];
      expect(proplist).toContain('new-routing-mark');
      expect(proplist).not.toContain('routing-table');
      expect(proplist).not.toContain('new-routing-table');
    });

    it('findMangleRuleById selects with ?.id= and asks for the same proplist', async () => {
      harness.existingRecord = probeConnRule;

      await withClient((client) => client.findMangleRuleById('*3'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/mangle/print');
      expect(harness.captured[0]?.queries).toEqual(['?.id=*3']);
    });

    it('findMangleRulesByReference lists everything and filters client-side, sending no query', async () => {
      harness.existingRecords = [probeConnRule];

      const found = await withClient((client) => client.findMangleRulesByReference('probe-conn'));

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(found.map((rule) => rule.id)).toEqual(['*3']);
    });

    it('maps multiple replies preserving physical order', async () => {
      harness.existingRecords = [
        { ...probeConnRule, '.id': '*1', chain: 'prerouting' },
        { ...probeConnRule, '.id': '*2', chain: 'forward' },
        { ...probeConnRule, '.id': '*5', chain: 'postrouting' },
      ];

      const rules = await withClient((client) => client.listMangleRules());

      expect(rules.map((rule) => [rule.id, rule.physicalIndex, rule.chain])).toEqual([
        ['*1', 0, 'prerouting'],
        ['*2', 1, 'forward'],
        ['*5', 2, 'postrouting'],
      ]);
    });

    it('returns empty results when the router reports no rules', async () => {
      harness.existingRecords = [];

      expect(await withClient((client) => client.listMangleRules())).toEqual([]);
      expect(await withClient((client) => client.findMangleRuleById('*99'))).toBeNull();
      expect(await withClient((client) => client.findMangleRulesByReference('nada'))).toEqual([]);
    });

    it('maps the captured mark-connection reply exactly as observed', async () => {
      harness.existingRecord = probeConnRule;

      const rule = await withClient((client) => client.findMangleRuleById('*3'));

      expect(rule).toEqual({
        action: 'mark-connection',
        bytes: 0,
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:probe-conn',
        disabled: true,
        dynamic: false,
        id: '*3',
        invalid: false,
        newConnectionMark: 'CUZONET_PROBE_CONN',
        ownership: { ruleReference: 'probe-conn', status: 'valid' },
        packets: 0,
        passthrough: true,
      });
    });

    it('maps every modelled property of a full reply', async () => {
      harness.existingRecord = {
        '.id': '*7',
        action: 'mark-routing',
        bytes: '123456',
        chain: 'output',
        comment: 'cuzonet:firewall-mangle:full-rule con detalle',
        'connection-mark': 'CM',
        'connection-state': 'new',
        disabled: 'false',
        'dst-address': '10.0.0.0/8',
        'dst-port': '443',
        dynamic: 'true',
        'in-interface': 'ether1',
        invalid: 'true',
        'new-connection-mark': 'NCM',
        'new-packet-mark': 'NPM',
        'new-routing-mark': 'main',
        'out-interface': 'ether2',
        'packet-mark': 'PM',
        packets: '789',
        passthrough: 'false',
        protocol: 'tcp',
        'routing-mark': 'RM',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
      };

      const rule = await withClient((client) => client.findMangleRuleById('*7'));

      expect(rule).toMatchObject({
        action: 'mark-routing',
        bytes: 123456,
        chain: 'output',
        connectionMark: 'CM',
        connectionState: 'new',
        disabled: false,
        dstAddress: '10.0.0.0/8',
        dstPort: '443',
        dynamic: true,
        inInterface: 'ether1',
        invalid: true,
        newConnectionMark: 'NCM',
        newPacketMark: 'NPM',
        newRoutingMark: 'main',
        outInterface: 'ether2',
        packetMark: 'PM',
        packets: 789,
        passthrough: false,
        protocol: 'tcp',
        routingMark: 'RM',
        srcAddress: '192.168.1.0/24',
        srcPort: '1024-65535',
      });
      expect(rule?.ownership).toEqual({
        ruleReference: 'full-rule',
        status: 'valid',
        userComment: 'con detalle',
      });
    });

    it('omits optional properties the router did not return', async () => {
      harness.existingRecord = { '.id': '*1', action: 'mark-packet', chain: 'forward', passthrough: 'true' };

      const rule = await withClient((client) => client.findMangleRuleById('*1'));

      for (const absent of [
        'protocol', 'srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface',
        'outInterface', 'connectionState', 'connectionMark', 'packetMark', 'routingMark',
        'newConnectionMark', 'newPacketMark', 'newRoutingMark', 'comment',
      ]) {
        expect(rule, absent).not.toHaveProperty(absent);
      }
      expect(rule).toMatchObject({ bytes: 0, disabled: false, dynamic: false, invalid: false, packets: 0 });
      expect(rule?.ownership.status).toBe('unmanaged');
    });

    it('keeps an empty-string value instead of dropping it as falsy', async () => {
      harness.existingRecord = {
        '.id': '*1', action: 'mark-packet', chain: 'forward', passthrough: 'true', 'src-address': '',
      };

      expect(await withClient((client) => client.findMangleRuleById('*1'))).toHaveProperty('srcAddress', '');
    });

    it('findMangleRuleById omits physicalIndex; a listing reports it', async () => {
      harness.existingRecord = { ...probeConnRule, '.id': '*42' };
      expect(await withClient((client) => client.findMangleRuleById('*42'))).not.toHaveProperty('physicalIndex');

      harness.existingRecords = [{ ...probeConnRule, '.id': '*10' }, { ...probeConnRule, '.id': '*42' }];
      expect((await withClient((client) => client.listMangleRules())).map((r) => r.physicalIndex)).toEqual([0, 1]);
    });
  });

  // =====================================================================
  // PASSTHROUGH
  // =====================================================================
  describe('passthrough', () => {
    it('maps the router value when present, in both boolean forms', async () => {
      for (const [raw, expected] of [['true', true], ['yes', true], ['false', false], ['no', false]] as const) {
        harness.existingRecord = { '.id': '*1', action: 'mark-packet', chain: 'forward', passthrough: raw };

        const rule = await withClient((client) => client.findMangleRuleById('*1'));

        expect(rule?.passthrough, `passthrough=${raw}`).toBe(expected);
      }
    });

    /**
     * Nunca se observo que RouterOS 7.21.4 omitiera el campo. Si alguna version lo hiciera,
     * el valor semantico correcto es el default observado, no `false`.
     */
    it('falls back to the documented default when the router omits it', async () => {
      harness.existingRecord = { '.id': '*1', action: 'mark-packet', chain: 'forward' };

      expect((await withClient((client) => client.findMangleRuleById('*1')))?.passthrough).toBe(true);
    });

    it('writes passthrough as the yes/no wire flag on add, in both directions', async () => {
      await withClient(async (client) => {
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'a', newPacketMark: 'p', passthrough: true,
        });
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'b', newPacketMark: 'p', passthrough: false,
        });
      });

      expect(harness.captured[0]?.attributes.passthrough).toBe('yes');
      expect(harness.captured[1]?.attributes.passthrough).toBe('no');
    });

    it('omits passthrough entirely when the caller does not decide it', async () => {
      await withClient((client) =>
        client.createMangleRule({ action: 'mark-packet', chain: 'forward', comment: 'c', newPacketMark: 'p' }),
      );

      expect(harness.captured[0]?.attributes).not.toHaveProperty('passthrough');
    });

    it('writes passthrough on set, including an explicit false', async () => {
      harness.existingRecord = probeConnRule;

      await withClient((client) => client.updateMangleRule({ id: '*3', kind: 'id' }, { passthrough: false }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ numbers: '*3', passthrough: 'no' });
    });
  });

  // =====================================================================
  // ADD
  // =====================================================================
  describe('ADD', () => {
    it('sends the minimum attributes for a minimal rule', async () => {
      await withClient((client) =>
        client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'cuzonet:firewall-mangle:min', newPacketMark: 'bulk',
        }),
      );

      expect(harness.captured).toHaveLength(1);
      expect(harness.captured[0]?.command).toBe('/ip/firewall/mangle/add');
      expect(harness.captured[0]?.attributes).toEqual({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:min',
        'new-packet-mark': 'bulk',
      });
    });

    it('serialises every attribute of a complete rule with RouterOS names', async () => {
      await withClient((client) =>
        client.createMangleRule({
          action: 'mark-routing',
          chain: 'prerouting',
          comment: 'cuzonet:firewall-mangle:full',
          connectionMark: 'CM',
          connectionState: 'new',
          disabled: false,
          dstAddress: '10.0.0.0/8',
          dstPort: '443',
          inInterface: 'ether1',
          newConnectionMark: 'NCM',
          newPacketMark: 'NPM',
          newRoutingMark: 'main',
          outInterface: 'ether2',
          packetMark: 'PM',
          passthrough: true,
          protocol: 'tcp',
          routingMark: 'RM',
          srcAddress: '192.168.1.0/24',
          srcPort: '1024-65535',
        }),
      );

      expect(harness.captured[0]?.attributes).toEqual({
        action: 'mark-routing',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:full',
        'connection-mark': 'CM',
        'connection-state': 'new',
        disabled: 'no',
        'dst-address': '10.0.0.0/8',
        'dst-port': '443',
        'in-interface': 'ether1',
        'new-connection-mark': 'NCM',
        'new-packet-mark': 'NPM',
        'new-routing-mark': 'main',
        'out-interface': 'ether2',
        'packet-mark': 'PM',
        passthrough: 'yes',
        protocol: 'tcp',
        'routing-mark': 'RM',
        'src-address': '192.168.1.0/24',
        'src-port': '1024-65535',
      });
    });

    it('writes disabled as the yes/no wire flag in both directions, and omits it when undecided', async () => {
      await withClient(async (client) => {
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'a', disabled: true, newPacketMark: 'p',
        });
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'b', disabled: false, newPacketMark: 'p',
        });
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'c', newPacketMark: 'p',
        });
      });

      expect(harness.captured[0]?.attributes.disabled).toBe('yes');
      expect(harness.captured[1]?.attributes.disabled).toBe('no');
      expect(harness.captured[2]?.attributes).not.toHaveProperty('disabled');
    });

    /**
     * La marca de enrutamiento va como `new-routing-mark`, la nomenclatura que la sonda de la
     * Fase 0 observo en 7.21.4. `routing-mark` existe pero es el MATCHER, no el efecto: solo
     * se envia si el llamador lo pide, y `routing-table` no se usa en este recurso.
     */
    it('writes the routing mark as new-routing-mark and never as a routing table', async () => {
      await withClient((client) =>
        client.createMangleRule({
          action: 'mark-routing',
          chain: 'prerouting',
          comment: 'cuzonet:firewall-mangle:routing',
          newRoutingMark: 'main',
        }),
      );

      const attributes = harness.captured[0]?.attributes ?? {};
      expect(attributes['new-routing-mark']).toBe('main');
      expect(attributes).not.toHaveProperty('routing-table');
      expect(attributes).not.toHaveProperty('new-routing-table');
      expect(attributes).not.toHaveProperty('routing-mark');
    });

    it('sends the three mark fields under their RouterOS names when all are requested', async () => {
      await withClient((client) =>
        client.createMangleRule({
          action: 'mark-packet',
          chain: 'forward',
          comment: 'cuzonet:firewall-mangle:marks',
          newConnectionMark: 'NCM',
          newPacketMark: 'NPM',
          newRoutingMark: 'main',
        }),
      );

      expect(harness.captured[0]?.attributes).toMatchObject({
        'new-connection-mark': 'NCM',
        'new-packet-mark': 'NPM',
        'new-routing-mark': 'main',
      });
    });

    it('sends place-before when requested and omits it otherwise', async () => {
      await withClient(async (client) => {
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'a', newPacketMark: 'p', placeBeforeId: '*4',
        });
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: 'b', newPacketMark: 'p',
        });
      });

      expect(harness.captured[0]?.attributes['place-before']).toBe('*4');
      expect(harness.captured[1]?.attributes).not.toHaveProperty('place-before');
    });
  });

  // =====================================================================
  // SET
  // =====================================================================
  describe('SET', () => {
    beforeEach(() => {
      harness.existingRecord = probeConnRule;
    });

    it('sends only the changed attributes, always with =numbers=', async () => {
      await withClient((client) =>
        client.updateMangleRule({ id: '*3', kind: 'id' }, { newConnectionMark: 'otra' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.command).toBe('/ip/firewall/mangle/set');
      expect(set?.attributes).toEqual({ 'new-connection-mark': 'otra', numbers: '*3' });
    });

    it('never sends a field the caller did not ask to change', async () => {
      await withClient((client) => client.updateMangleRule({ id: '*3', kind: 'id' }, { protocol: 'udp' }));

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ numbers: '*3', protocol: 'udp' });
      for (const untouched of [
        'action', 'chain', 'comment', 'connection-mark', 'connection-state', 'disabled',
        'dst-address', 'dst-port', 'in-interface', 'new-connection-mark', 'new-packet-mark',
        'new-routing-mark', 'out-interface', 'packet-mark', 'passthrough', 'routing-mark',
        'src-address', 'src-port',
      ]) {
        expect(set?.attributes, untouched).not.toHaveProperty(untouched);
      }
    });

    /** Un `false` es una decision, no una ausencia: debe viajar como `no`, nunca omitirse. */
    it('preserves both booleans, sending true as yes and false as no', async () => {
      await withClient(async (client) => {
        await client.updateMangleRule({ id: '*3', kind: 'id' }, { disabled: true, passthrough: true });
        await client.updateMangleRule({ id: '*3', kind: 'id' }, { disabled: false, passthrough: false });
      });

      const sets = harness.captured.filter((entry) => entry.command.endsWith('/set'));
      expect(sets[0]?.attributes).toEqual({ disabled: 'yes', numbers: '*3', passthrough: 'yes' });
      expect(sets[1]?.attributes).toEqual({ disabled: 'no', numbers: '*3', passthrough: 'no' });
    });

    it('sends no /set at all when the update carries no fields', async () => {
      await withClient((client) => client.updateMangleRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print']);
    });

    it('clears a field by sending it explicitly as an empty string', async () => {
      await withClient((client) =>
        client.updateMangleRule({ id: '*3', kind: 'id' }, { newConnectionMark: '', srcAddress: '' }),
      );

      const set = harness.captured.find((entry) => entry.command.endsWith('/set'));
      expect(set?.attributes).toEqual({ 'new-connection-mark': '', numbers: '*3', 'src-address': '' });
    });

    it('resolves a managed-reference locator through a full listing before setting', async () => {
      await withClient((client) =>
        client.updateMangleRule({ kind: 'managed-reference', ruleReference: 'probe-conn' }, { protocol: 'udp' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print', '/ip/firewall/mangle/set']);
      expect(harness.captured[1]?.attributes.numbers).toBe('*3');
    });
  });

  // =====================================================================
  // MOVE, ENABLE, DISABLE, REMOVE
  // =====================================================================
  describe('MOVE', () => {
    beforeEach(() => {
      harness.existingRecord = probeConnRule;
    });

    it('moves before another rule using its .id as destination', async () => {
      await withClient((client) => client.moveMangleRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*1' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.command).toBe('/ip/firewall/mangle/move');
      expect(move?.attributes).toEqual({ destination: '*1', numbers: '*3' });
    });

    it('moves to the end by counting the rules and using that count as destination', async () => {
      harness.existingRecords = [
        { ...probeConnRule, '.id': '*3' },
        { ...probeConnRule, '.id': '*1' },
        { ...probeConnRule, '.id': '*2' },
      ];

      await withClient((client) => client.moveMangleRule({ id: '*3', kind: 'id' }, {}));

      expect(commandsOf()).toEqual([
        '/ip/firewall/mangle/print',
        '/ip/firewall/mangle/print',
        '/ip/firewall/mangle/move',
      ]);
      expect(harness.captured[2]?.attributes).toEqual({ destination: '3', numbers: '*3' });
    });

    it('does nothing when the rule to move does not exist', async () => {
      harness.existingRecords = [];

      await withClient((client) => client.moveMangleRule({ id: '*99', kind: 'id' }, { placeBeforeId: '*1' }));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print']);
    });

    /**
     * El destino no se valida contra el listado: se envia tal cual y decide el router. Es la
     * unica lectura correcta, porque entre el listado y el `/move` la cadena puede cambiar.
     */
    it('sends an unknown destination verbatim instead of silently appending', async () => {
      await withClient((client) => client.moveMangleRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*404' }));

      const move = harness.captured.find((entry) => entry.command.endsWith('/move'));
      expect(move?.attributes).toEqual({ destination: '*404', numbers: '*3' });
    });

    it('surfaces the router rejection when the destination does not exist', async () => {
      harness.trap = { forCommandEndingIn: '/move', message: 'no such item' };

      await expect(
        withClient((client) => client.moveMangleRule({ id: '*3', kind: 'id' }, { placeBeforeId: '*404' })),
      ).rejects.toThrow('no such item');
    });

    it('resolves a managed-reference locator through a full listing before moving', async () => {
      harness.existingRecords = [{ ...probeConnRule, '.id': '*9' }];

      await withClient((client) =>
        client.moveMangleRule({ kind: 'managed-reference', ruleReference: 'probe-conn' }, { placeBeforeId: '*1' }),
      );

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print', '/ip/firewall/mangle/move']);
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(harness.captured[1]?.attributes).toEqual({ destination: '*1', numbers: '*9' });
    });
  });

  describe('ENABLE, DISABLE and REMOVE', () => {
    const CASES = [
      ['enableMangleRule', '/ip/firewall/mangle/enable'],
      ['disableMangleRule', '/ip/firewall/mangle/disable'],
      ['removeMangleRule', '/ip/firewall/mangle/remove'],
    ] as const;

    it.each(CASES)('%s resolves the rule and sends %s with =numbers=', async (method, command) => {
      harness.existingRecord = probeConnRule;

      await withClient((client) => client[method]({ id: '*3', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print', command]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*3' });
    });

    it.each(CASES)('%s resolves a managed-reference locator through a full listing', async (method, command) => {
      harness.existingRecords = [{ ...probeConnRule, '.id': '*9' }];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'probe-conn' }));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print', command]);
      // La resolucion por referencia lista todo y filtra localmente: sin `?comment=`.
      expect(harness.captured[0]?.queries).toEqual([]);
      expect(harness.captured[1]?.attributes).toEqual({ numbers: '*9' });
    });

    it.each(CASES)('%s does nothing when the managed reference matches no rule', async (method) => {
      harness.existingRecords = [{ ...probeConnRule, comment: 'cuzonet:firewall-mangle:otra' }];

      await withClient((client) => client[method]({ kind: 'managed-reference', ruleReference: 'probe-conn' }));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print']);
    });

    it.each(CASES)('%s does nothing when the rule does not exist', async (method) => {
      harness.existingRecords = [];

      await withClient((client) => client[method]({ id: '*99', kind: 'id' }));

      expect(commandsOf()).toEqual(['/ip/firewall/mangle/print']);
    });

    it('never emits a duplicated /print/print for any mangle operation', async () => {
      harness.existingRecord = probeConnRule;

      await withClient(async (client) => {
        await client.listMangleRules();
        await client.findMangleRuleById('*3');
        await client.enableMangleRule({ id: '*3', kind: 'id' });
        await client.removeMangleRule({ id: '*3', kind: 'id' });
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
        harness.existingRecord = { '.id': '*1', action: 'mark-packet', chain: 'forward', [flag]: raw };

        const rule = await withClient((client) => client.findMangleRuleById('*1'));

        expect(rule?.[flag as keyof ObservedMangleRule], `${flag}=${raw}`).toBe(true);
      }
    });

    it.each(FLAGS)('reads %s as false for "false", "no", an unknown value and an absent key', async (flag) => {
      for (const raw of ['false', 'no', 'maybe', undefined]) {
        harness.existingRecord = {
          '.id': '*1', action: 'mark-packet', chain: 'forward',
          ...(raw !== undefined ? { [flag]: raw } : {}),
        };

        const rule = await withClient((client) => client.findMangleRuleById('*1'));

        expect(rule?.[flag as keyof ObservedMangleRule], `${flag}=${String(raw)}`).toBe(false);
      }
    });
  });

  // =====================================================================
  // TRAPS
  // =====================================================================
  describe('traps', () => {
    const addRule = (client: LibraryRouterOsClient) =>
      client.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: 'cuzonet:firewall-mangle:t', newPacketMark: 'p',
      });

    const TRAPS = [
      ['not found', 'no such item'],
      ['duplicate', 'failure: already have such entry'],
      ['generic failure', 'failure'],
      ['invalid parameter', 'unknown parameter foo'],
      ['invalid action', 'input does not match any value of action'],
      ['invalid chain', 'failure: chain does not exist'],
      ['invalid protocol', 'input does not match any value of protocol'],
      ['invalid interface', 'input does not match any value of in-interface'],
      ['invalid mark', 'invalid value for argument new-packet-mark'],
      // Capturado literalmente del router durante la Fase 0 al enviar un valor
      // inexistente: `new-routing-mark` se valida contra las tablas de enrutamiento.
      ['unknown routing mark', 'input does not match any value of new-routing-mark'],
    ] as const;

    /**
     * Solo el trap de `new-routing-mark` esta capturado del router; el resto reproduce la
     * FORMA de los mensajes que RouterOS emite para cada familia de error. Lo certificado
     * aqui es la propagacion verbatim, no la redaccion exacta de cada mensaje: el mapeo a
     * errores de dominio corresponde a la Fase 4 y debe leer el mensaje, no un codigo.
     */
    it.each(TRAPS)('surfaces a "%s" trap verbatim from /add, as RouterOSTrapError', async (_label, message) => {
      harness.trap = { forCommandEndingIn: '/add', message };

      const error = await withClient((client) =>
        addRule(client).then(() => null).catch((caught: unknown) => caught),
      );

      expect((error as Error).name).toBe('RouterOSTrapError');
      expect((error as Error).message).toBe(message);
    });

    it('exposes the trap as RouterOSTrapError, so callers can map it by message', async () => {
      harness.trap = {
        category: '0', forCommandEndingIn: '/add',
        message: 'input does not match any value of new-routing-mark',
      };

      const error = await withClient((client) =>
        addRule(client).then(() => null).catch((caught: unknown) => caught),
      );

      expect((error as Error).name).toBe('RouterOSTrapError');
      expect((error as Error).message).toBe('input does not match any value of new-routing-mark');
    });

    it.each([['/set'], ['/move'], ['/enable'], ['/disable'], ['/remove']])(
      'propagates a trap raised by %s',
      async (suffix) => {
        harness.existingRecord = probeConnRule;
        harness.trap = { forCommandEndingIn: suffix, message: 'no such item' };
        const locator = { id: '*3', kind: 'id' } as const;

        const run = async (client: LibraryRouterOsClient): Promise<void> => {
          if (suffix === '/set') return client.updateMangleRule(locator, { protocol: 'udp' });
          if (suffix === '/move') return client.moveMangleRule(locator, { placeBeforeId: '*1' });
          if (suffix === '/enable') return client.enableMangleRule(locator);
          if (suffix === '/disable') return client.disableMangleRule(locator);
          return client.removeMangleRule(locator);
        };

        await expect(withClient(run)).rejects.toThrow('no such item');
      },
    );

    it('propagates a trap raised by /print, instead of reporting an empty router', async () => {
      harness.trap = { forCommandEndingIn: '/print', message: 'not enough permissions' };

      await expect(withClient((client) => client.listMangleRules())).rejects.toThrow('not enough permissions');
    });
  });
});
