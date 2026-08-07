import { describe, it, expect } from 'vitest';

import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import { withDesiredFieldDefaults } from '../../../../backend/infrastructure/synchronization/desired-field-defaults.js';
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

  it('keeps the Mangle-only fields out of Filter and NAT', () => {
    for (const mangleOnly of ['passthrough', 'newPacketMark', 'newConnectionMark', 'newRoutingMark']) {
      expect(RULE_FIELD_NAMES['filter-rule'], mangleOnly).to.not.contain(mangleOnly);
      expect(RULE_FIELD_NAMES['nat-rule'], mangleOnly).to.not.contain(mangleOnly);
    }
  });
});

describe('withDesiredFieldDefaults', () => {
  it('materialises the Mangle passthrough default when the declaration omits it', () => {
    expect(withDesiredFieldDefaults('mangle-rule', { action: 'mark-packet' })).to.deep.equal({
      action: 'mark-packet',
      passthrough: String(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough),
    });
  });

  it.each([['true'], ['false']])('never overrides a declared passthrough=%s', (declared) => {
    expect(withDesiredFieldDefaults('mangle-rule', { passthrough: declared }).passthrough).to.equal(declared);
  });

  it('leaves resources without observed defaults untouched', () => {
    for (const resourceType of ['filter-rule', 'nat-rule', 'address-list-entry', 'simple-queue'] as const) {
      const fields = { chain: 'forward' };
      expect(withDesiredFieldDefaults(resourceType, fields), resourceType).to.deep.equal(fields);
    }
  });
});
