import { describe, it, expect } from 'vitest';

import {
  RAW_RULE_TARGET_TYPE,
  findRawRuleCoherenceViolation,
  routerOsRawRuleInputSchema,
} from '../../../../../backend/infrastructure/provisioning/routeros/routeros-raw-rule.input.js';

function add(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'drop',
    actionType: 'routeros.firewall.raw.add',
    chain: 'prerouting',
    routerId: 'router-1',
    ruleReference: 'block-bogons',
    ...overrides,
  };
}

const parse = (payload: unknown) => routerOsRawRuleInputSchema.safeParse(payload);
const ok = (payload: unknown) => parse(payload).success;

describe('routerOsRawRuleInputSchema', () => {
  describe('add', () => {
    it('accepts a minimal rule', () => {
      expect(ok(add())).to.equal(true);
    });

    it('accepts every observed matcher and effect together', () => {
      expect(
        ok(
          add({
            comment: 'bloqueo',
            disabled: true,
            dstAddress: '10.0.0.0/8',
            dstAddressList: 'destinos',
            dstPort: '443',
            inInterface: 'ether1',
            log: true,
            logPrefix: 'RAW',
            outInterface: 'ether2',
            packetMark: 'marca',
            position: 0,
            protocol: 'tcp',
            srcAddress: '!192.168.88.0/24',
            srcAddressList: 'origenes',
            srcPort: '1024-65535',
            tcpFlags: 'syn,!ack',
          }),
        ),
      ).to.equal(true);
    });

    it.each([['prerouting'], ['output']])('accepts chain %s', (chain) => {
      expect(ok(add({ chain }))).to.equal(true);
    });

    it.each([['input'], ['forward'], ['postrouting'], ['srcnat'], ['inexistente']])('rejects chain %s', (chain) => {
      expect(ok(add({ chain }))).to.equal(false);
    });

    it.each([
      ['accept'],
      ['drop'],
      ['log'],
      ['passthrough'],
      ['return'],
    ])('accepts action %s without a companion field', (action) => {
      expect(ok(add({ action }))).to.equal(true);
    });

    it('rejects notrack, which is not a certified capability', () => {
      expect(ok(add({ action: 'notrack' }))).to.equal(false);
    });

    it.each([['reject'], ['masquerade'], ['mark-packet']])('rejects action %s from another resource', (action) => {
      expect(ok(add({ action }))).to.equal(false);
    });
  });

  describe('strict mode', () => {
    /**
     * Los otros recursos usan el modo por defecto de Zod, que DESCARTA en silencio las claves
     * desconocidas. Aqui se rechazan: un campo que Raw no soporta debe fallar, no perderse.
     */
    it.each([
      ['connectionState', 'new'],
      ['connectionMark', 'marca'],
      ['routingMark', 'marca'],
      ['passthrough', true],
      ['newConnectionMark', 'marca'],
      ['newPacketMark', 'marca'],
      ['newRoutingMark', 'marca'],
      ['routingTable', 'main'],
    ])('rejects the unsupported field %s', (field, value) => {
      expect(ok(add({ [field]: value }))).to.equal(false);
    });

    it.each([
      ['.id', '*1'],
      ['id', '*1'],
      ['dynamic', false],
      ['invalid', false],
      ['bytes', 0],
      ['packets', 0],
      ['physicalIndex', 0],
      ['ownership', { status: 'valid' }],
    ])('rejects the read-only field %s', (field, value) => {
      expect(ok(add({ [field]: value }))).to.equal(false);
    });

    it('rejects an arbitrary unknown field', () => {
      expect(ok(add({ loQueSea: 'x' }))).to.equal(false);
    });

    it.each([
      ['routeros.firewall.raw.update', { protocol: 'tcp' }],
      ['routeros.firewall.raw.move', { position: 0 }],
      ['routeros.firewall.raw.enable', {}],
      ['routeros.firewall.raw.disable', {}],
      ['routeros.firewall.raw.remove', {}],
    ])('is strict on %s as well', (actionType, extra) => {
      expect(ok({ actionType, routerId: 'r', ruleReference: 'ref', ...extra })).to.equal(true);
      expect(ok({ actionType, routerId: 'r', ruleReference: 'ref', ...extra, desconocido: 1 })).to.equal(false);
    });
  });

  describe('IPv4-only addresses', () => {
    it.each([['192.168.88.0/24'], ['10.0.0.1'], ['!172.16.0.0/12']])('accepts the IPv4 spec %s', (srcAddress) => {
      expect(ok(add({ srcAddress }))).to.equal(true);
    });

    /** Este recurso escribe en /ip/firewall/raw; IPv6 es otra tabla y otro contrato. */
    it.each([
      ['2001:db8::1'],
      ['2001:db8::/32'],
      ['fe80::1'],
      ['::1'],
    ])('rejects the IPv6 spec %s', (address) => {
      expect(ok(add({ srcAddress: address }))).to.equal(false);
      expect(ok(add({ dstAddress: address }))).to.equal(false);
    });

    it.each([['999.1.1.1'], ['10.0.0.0/33'], ['no-una-ip']])('rejects the malformed spec %s', (srcAddress) => {
      expect(ok(add({ srcAddress }))).to.equal(false);
    });
  });

  describe('ports and protocol', () => {
    it.each([['tcp'], ['udp'], ['sctp']])('accepts ports with the port-bearing protocol %s', (protocol) => {
      expect(ok(add({ dstPort: '443', protocol }))).to.equal(true);
    });

    it.each([['srcPort'], ['dstPort']])('rejects %s without any protocol', (field) => {
      expect(ok(add({ [field]: '443' }))).to.equal(false);
    });

    it.each([['icmp'], ['gre'], ['ospf'], ['47']])('rejects ports with the portless protocol %s', (protocol) => {
      expect(ok(add({ dstPort: '443', protocol }))).to.equal(false);
    });

    it.each([['80'], ['80,443'], ['1000-2000'], ['80,1000-2000,8443']])('accepts the port spec %s', (dstPort) => {
      expect(ok(add({ dstPort, protocol: 'tcp' }))).to.equal(true);
    });

    /** RouterOS acepta un rango invertido y no matchea nada; se rechaza aqui. */
    it.each([['2000-1000'], ['443-80'], ['80,3000-2000']])('rejects the inverted range %s', (dstPort) => {
      expect(ok(add({ dstPort, protocol: 'tcp' }))).to.equal(false);
    });

    it.each([['0'], ['65536'], ['abc'], ['80-'], ['1-2-3']])('rejects the invalid port spec %s', (dstPort) => {
      expect(ok(add({ dstPort, protocol: 'tcp' }))).to.equal(false);
    });

    it('accepts an equal-bounds range', () => {
      expect(ok(add({ dstPort: '443-443', protocol: 'tcp' }))).to.equal(true);
    });
  });

  describe('tcpFlags', () => {
    it('accepts flags over tcp', () => {
      expect(ok(add({ protocol: 'tcp', tcpFlags: 'syn,!ack' }))).to.equal(true);
    });

    it('rejects flags without tcp', () => {
      expect(ok(add({ protocol: 'udp', tcpFlags: 'syn' }))).to.equal(false);
      expect(ok(add({ tcpFlags: 'syn' }))).to.equal(false);
    });

    it('rejects an unknown flag', () => {
      expect(ok(add({ protocol: 'tcp', tcpFlags: 'inexistente' }))).to.equal(false);
    });
  });

  describe('action/companion coherence', () => {
    it('rejects jump without jumpTarget', () => {
      expect(ok(add({ action: 'jump' }))).to.equal(false);
    });

    it('accepts jump with jumpTarget', () => {
      expect(ok(add({ action: 'jump', jumpTarget: 'mi-chain' }))).to.equal(true);
    });

    /**
     * Direccion INVERSA, encontrada por la certificacion E2E de la Fase 6: el router DESCARTA
     * `jump-target` en silencio cuando la accion no es `jump`. Antes la regla se creaba sin el
     * campo y solo la postcondicion del adapter detectaba la divergencia, ya con la regla
     * puesta en el router. Ahora se rechaza en la frontera, sin efectos.
     */
    describe('jumpTarget is only valid with action=jump', () => {
      it.each([
        ['accept'],
        ['drop'],
        ['log'],
        ['passthrough'],
        ['return'],
        ['add-src-to-address-list'],
        ['add-dst-to-address-list'],
      ])('rejects jumpTarget with action=%s', (action) => {
        const extra = action.startsWith('add-') ? { addressList: 'lista' } : {};
        expect(ok(add({ action, jumpTarget: 'mi-chain', ...extra }))).to.equal(false);
      });

      it('keeps accepting those actions when jumpTarget is absent', () => {
        for (const action of ['accept', 'drop', 'log', 'passthrough', 'return']) {
          expect(ok(add({ action })), action).to.equal(true);
        }
      });

      it('names jumpTarget as the offending field', () => {
        const result = parse(add({ action: 'accept', jumpTarget: 'mi-chain' }));

        expect(result.success).to.equal(false);
        if (!result.success) {
          expect(result.error.issues.some((issue) => issue.path.includes('jumpTarget'))).to.equal(true);
        }
      });
    });

    /** `addressList` NO lleva prohibicion inversa: no se observo que el router lo descarte. */
    it('still accepts addressList on an action that does not consume it', () => {
      expect(ok(add({ action: 'accept', addressList: 'lista' }))).to.equal(true);
    });

    it.each([['add-src-to-address-list'], ['add-dst-to-address-list']])('rejects %s without addressList', (action) => {
      expect(ok(add({ action }))).to.equal(false);
    });

    it.each([['add-src-to-address-list'], ['add-dst-to-address-list']])('accepts %s with addressList', (action) => {
      expect(ok(add({ action, addressList: 'sospechosos', addressListTimeout: '1h' }))).to.equal(true);
    });

    it.each([['1m'], ['30s'], ['1h30m'], ['0']])('accepts the timeout %s', (addressListTimeout) => {
      expect(ok(add({ action: 'add-src-to-address-list', addressList: 'l', addressListTimeout }))).to.equal(true);
    });

    it.each([['manana'], ['1x'], ['-1m']])('rejects the timeout %s', (addressListTimeout) => {
      expect(ok(add({ action: 'add-src-to-address-list', addressList: 'l', addressListTimeout }))).to.equal(false);
    });

    /**
     * En `update` la coherencia NO se comprueba: un patch puede cambiar solo la accion y
     * apoyarse en el jumpTarget que la regla ya tiene. Eso exige el estado observado y
     * corresponde al adapter de la Fase 4.
     */
    it('does not demand the companion field on update, which cannot see the existing rule', () => {
      expect(
        ok({ action: 'jump', actionType: 'routeros.firewall.raw.update', routerId: 'r', ruleReference: 'ref' }),
      ).to.equal(true);
    });

    describe('update and the jumpTarget prohibition', () => {
      const update = (payload: Record<string, unknown>) =>
        ok({ actionType: 'routeros.firewall.raw.update', routerId: 'r', ruleReference: 'ref', ...payload });

      /** Contradiccion visible sin consultar el router: ambos campos en el mismo patch. */
      it.each([['accept'], ['drop']])('rejects a patch declaring action=%s together with jumpTarget', (action) => {
        expect(update({ action, jumpTarget: 'mi-chain' })).to.equal(false);
      });

      it('accepts a patch declaring action=jump together with jumpTarget', () => {
        expect(update({ action: 'jump', jumpTarget: 'mi-chain' })).to.equal(true);
      });

      /**
       * CONDUCTA PRESERVADA, certificada E2E en la Fase 6: un patch que declara solo uno de
       * los dos se resuelve contra el estado observado en el adapter, no aqui.
       */
      it('accepts a patch that declares only the action, leaning on the observed rule', () => {
        expect(update({ action: 'accept' })).to.equal(true);
      });

      it('accepts a patch that declares only jumpTarget, leaning on the observed action', () => {
        expect(update({ jumpTarget: 'mi-chain' })).to.equal(true);
      });
    });
  });

  describe('discriminated union', () => {
    it('rejects an unknown actionType', () => {
      expect(ok({ actionType: 'routeros.firewall.raw.notrack', routerId: 'r', ruleReference: 'ref' })).to.equal(false);
    });

    it('requires position on move and rejects a negative one', () => {
      expect(ok({ actionType: 'routeros.firewall.raw.move', routerId: 'r', ruleReference: 'ref' })).to.equal(false);
      expect(
        ok({ actionType: 'routeros.firewall.raw.move', position: -1, routerId: 'r', ruleReference: 'ref' }),
      ).to.equal(false);
    });

    it('requires routerId and ruleReference everywhere', () => {
      expect(ok({ actionType: 'routeros.firewall.raw.enable', ruleReference: 'ref' })).to.equal(false);
      expect(ok({ actionType: 'routeros.firewall.raw.enable', routerId: 'r' })).to.equal(false);
    });

    it('rejects a ruleReference with characters the comment marker could not recover', () => {
      expect(ok(add({ ruleReference: 'con espacio' }))).to.equal(false);
    });
  });
});

describe('findRawRuleCoherenceViolation', () => {
  const envelope = (overrides: Partial<{ actionType: string; inputSnapshotJson: string; target: { id: string; type: string } }> = {}) => ({
    actionType: 'routeros.firewall.raw.add',
    inputSnapshotJson: JSON.stringify({ actionType: 'routeros.firewall.raw.add', ruleReference: 'block-bogons' }),
    target: { id: 'block-bogons', type: RAW_RULE_TARGET_TYPE },
    ...overrides,
  });

  it('returns null when envelope and payload agree', () => {
    expect(findRawRuleCoherenceViolation(envelope())).to.equal(null);
  });

  it('rejects a wrong targetType', () => {
    const violation = findRawRuleCoherenceViolation(
      envelope({ target: { id: 'block-bogons', type: 'Firewall Filter Rule' } }),
    );

    expect(violation?.errorCode).to.equal('ROUTEROS_INVALID_TARGET_TYPE');
    expect(violation?.errorMessage).to.contain('Firewall Filter Rule');
  });

  it('rejects an actionType that contradicts the payload', () => {
    const violation = findRawRuleCoherenceViolation(
      envelope({
        actionType: 'routeros.firewall.raw.remove',
        target: { id: 'block-bogons', type: RAW_RULE_TARGET_TYPE },
      }),
    );

    expect(violation?.errorCode).to.equal('ROUTEROS_ACTION_MISMATCH');
  });

  it('rejects a targetId that does not name the rule in the payload', () => {
    const violation = findRawRuleCoherenceViolation(
      envelope({ target: { id: 'otra-regla', type: RAW_RULE_TARGET_TYPE } }),
    );

    expect(violation?.errorCode).to.equal('ROUTEROS_TARGET_MISMATCH');
    expect(violation?.errorMessage).to.contain('block-bogons');
  });

  it('checks targetType before reading the payload at all', () => {
    const violation = findRawRuleCoherenceViolation(
      envelope({ inputSnapshotJson: '{ json roto', target: { id: 'x', type: 'Otro' } }),
    );

    expect(violation?.errorCode).to.equal('ROUTEROS_INVALID_TARGET_TYPE');
  });

  it('leaves invalid JSON to schema validation instead of inventing a violation', () => {
    expect(findRawRuleCoherenceViolation(envelope({ inputSnapshotJson: '{ json roto' }))).to.equal(null);
  });

  it('ignores a payload that carries neither actionType nor ruleReference', () => {
    expect(findRawRuleCoherenceViolation(envelope({ inputSnapshotJson: JSON.stringify({ routerId: 'r' }) }))).to.equal(
      null,
    );
  });
});
