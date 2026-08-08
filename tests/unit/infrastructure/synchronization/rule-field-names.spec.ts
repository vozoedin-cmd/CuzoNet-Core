import { describe, it, expect } from 'vitest';

import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import {
  normalizeActualFields,
  normalizeDesiredFields,
} from '../../../../backend/infrastructure/synchronization/desired-state-normalization.js';
import { RULE_FIELD_NAMES } from '../../../../backend/infrastructure/synchronization/rule-field-names.js';

/**
 * La tabla de campos es el contrato de comparacion: decide que produce drift y que no.
 * Se fija entera —no por inclusion— para que agregar o quitar un campo tenga que ser una
 * decision explicita y visible en el diff, nunca un efecto colateral.
 */
describe('RULE_FIELD_NAMES', () => {
  it('pins the exact Mangle field list, in order', () => {
    expect(RULE_FIELD_NAMES['mangle-rule']).to.deep.equal([
      'chain',
      'action',
      'protocol',
      'srcAddress',
      'dstAddress',
      'srcPort',
      'dstPort',
      'inInterface',
      'outInterface',
      'connectionState',
      'connectionMark',
      'packetMark',
      'routingMark',
      'newConnectionMark',
      'newPacketMark',
      'newRoutingMark',
      'passthrough',
    ]);
  });

  /**
   * Los de solo lectura arruinarian la comparacion: `bytes` y `packets` cambian entre dos
   * lecturas seguidas, y `dynamic`/`invalid`/`physicalIndex` los impone el router y nadie
   * puede declararlos. `.id`, `ownership` y `comment` son identidad, no configuracion —
   * `comment` ademas carga el marcador tecnico, asi que compararlo convertiria el propio
   * marcador de propiedad en drift.
   */
  it.each([
    'dynamic', 'invalid', 'bytes', 'packets', 'physicalIndex', 'ownership', 'comment', '.id', 'id',
  ])('never compares the read-only or identity field %s', (field) => {
    expect(RULE_FIELD_NAMES['mangle-rule']).to.not.contain(field);
  });

  /** `disabled` SI se compara, pero como campo propio del record, fuera de `fields`. */
  it('leaves disabled out of the field list because the record carries it', () => {
    expect(RULE_FIELD_NAMES['mangle-rule']).to.not.contain('disabled');
  });

  it('pins the exact Raw field list, in order', () => {
    expect(RULE_FIELD_NAMES['raw-rule']).to.deep.equal([
      'chain',
      'action',
      'protocol',
      'srcAddress',
      'dstAddress',
      'srcPort',
      'dstPort',
      'inInterface',
      'outInterface',
      'srcAddressList',
      'dstAddressList',
      'tcpFlags',
      'packetMark',
      'log',
      'logPrefix',
      'jumpTarget',
      'addressList',
      'addressListTimeout',
    ]);
  });

  /** Raw corre antes del conntrack: el router rechaza estos con `unknown parameter`. */
  it.each(['connectionState', 'connectionMark', 'routingMark', 'passthrough', 'newPacketMark'])(
    'never compares the conntrack field %s that Raw does not have',
    (field) => {
      expect(RULE_FIELD_NAMES['raw-rule']).to.not.contain(field);
    },
  );

  it.each(['dynamic', 'invalid', 'bytes', 'packets', 'physicalIndex', 'ownership', 'comment', '.id', 'id', 'disabled'])(
    'keeps the read-only or identity field %s out of the Raw list',
    (field) => {
      expect(RULE_FIELD_NAMES['raw-rule']).to.not.contain(field);
    },
  );

  it('keeps the Mangle-only fields out of Filter and NAT', () => {
    for (const mangleOnly of ['passthrough', 'newPacketMark', 'newConnectionMark', 'newRoutingMark']) {
      expect(RULE_FIELD_NAMES['filter-rule'], mangleOnly).to.not.contain(mangleOnly);
      expect(RULE_FIELD_NAMES['nat-rule'], mangleOnly).to.not.contain(mangleOnly);
    }
  });
});

describe('normalizeDesiredFields', () => {
  it('materialises the Mangle passthrough default when the declaration omits it', () => {
    expect(normalizeDesiredFields('mangle-rule', { action: 'mark-packet' })).to.deep.equal({
      action: 'mark-packet',
      passthrough: String(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough),
    });
  });

  it.each([['true'], ['false']])('never overrides a declared passthrough=%s', (declared) => {
    expect(normalizeDesiredFields('mangle-rule', { passthrough: declared }).passthrough).to.equal(declared);
  });

  it('leaves resources without observed defaults untouched', () => {
    for (const resourceType of ['filter-rule', 'nat-rule', 'address-list-entry', 'simple-queue'] as const) {
      const fields = { chain: 'forward' };
      expect(normalizeDesiredFields(resourceType, fields), resourceType).to.deep.equal(fields);
    }
  });

  /**
   * Raw NO recibe defaults. La sonda de la Fase 0-bis comprobo que ningun booleano opcional
   * se materializa en /ip/firewall/raw, asi que inventar uno seria fabricar estado.
   */
  describe('raw-rule receives no defaults at all', () => {
    it('adds nothing to a declaration that omits every optional field', () => {
      const declared = { action: 'drop', chain: 'prerouting' };

      expect(normalizeDesiredFields('raw-rule', declared)).to.deep.equal(declared);
    });

    it('never materialises log, in either direction', () => {
      const normalized = normalizeDesiredFields('raw-rule', { action: 'drop', chain: 'prerouting' });

      expect(normalized).to.not.have.property('log');
      expect(Object.keys(normalized)).to.deep.equal(['action', 'chain']);
    });

    it('does not borrow the Mangle passthrough default', () => {
      expect(normalizeDesiredFields('raw-rule', { chain: 'prerouting' })).to.not.have.property('passthrough');
    });
  });

  /**
   * `log=false` y `log` ausente son EL MISMO ESTADO: el router omite el campo cuando no esta
   * activo. Se canoniza quitando el `false` —la forma del router— en vez de inventar un
   * default. Sin esto, una declaracion con `log=false` quedaria en drift permanente e
   * irreparable frente a un router que simplemente no devuelve el campo.
   */
  describe('raw-rule log canonicalisation', () => {
    it('drops a declared log=false, because the router omits it', () => {
      expect(normalizeDesiredFields('raw-rule', { chain: 'prerouting', log: 'false' })).to.deep.equal({
        chain: 'prerouting',
      });
    });

    it('keeps a declared log=true, which the router does return', () => {
      expect(normalizeDesiredFields('raw-rule', { chain: 'prerouting', log: 'true' })).to.deep.equal({
        chain: 'prerouting',
        log: 'true',
      });
    });

    it('applies the same canonical form to the actual side', () => {
      expect(normalizeActualFields('raw-rule', { chain: 'prerouting', log: 'false' })).to.deep.equal({
        chain: 'prerouting',
      });
      expect(normalizeActualFields('raw-rule', { chain: 'prerouting', log: 'true' })).to.deep.equal({
        chain: 'prerouting',
        log: 'true',
      });
    });

    it('never touches log on another resource', () => {
      const fields = { chain: 'forward', log: 'false' };
      expect(normalizeDesiredFields('filter-rule', fields)).to.deep.equal(fields);
      expect(normalizeActualFields('filter-rule', fields)).to.deep.equal(fields);
    });

    it('leaves other raw fields alone even when they read false-ish', () => {
      const fields = { logPrefix: 'false', srcAddress: '0.0.0.0/0' };
      expect(normalizeDesiredFields('raw-rule', fields)).to.deep.equal(fields);
    });
  });
});
