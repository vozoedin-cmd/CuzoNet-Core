import { describe, it, expect } from 'vitest';

import { RawAction } from '../../../../../backend/domain/provisioning/routeros/value-objects/raw-action.js';
import { RawChain } from '../../../../../backend/domain/provisioning/routeros/value-objects/raw-chain.js';
import { RawRuleComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/raw-rule-comment.js';
import { RawRuleReference } from '../../../../../backend/domain/provisioning/routeros/value-objects/raw-rule-reference.js';

/**
 * `InvalidProvisioningDataError` lleva un mensaje generico y el detalle util en `details`,
 * asi que aserta sobre el mensaje de la excepcion no distinguiria un rechazo de otro.
 */
function rejectionDetail(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    const details = (error as { details?: readonly { message: string; path: string }[] }).details;
    return details?.map((detail) => `${detail.path}: ${detail.message}`).join(' | ') ?? '';
  }
  throw new Error('Se esperaba un rechazo y no hubo ninguno.');
}

describe('RawChain', () => {
  it.each([['prerouting'], ['output']])('accepts the built-in chain %s', (chain) => {
    expect(RawChain.create(chain).value).to.equal(chain);
  });

  it('normalises case and surrounding whitespace', () => {
    expect(RawChain.create('  PREROUTING  ').value).to.equal('prerouting');
  });

  /**
   * La sonda de la Fase 0-bis demostro que RouterOS ACEPTA estas chains en Raw —son chains
   * personalizadas creadas al vuelo— asi que el rechazo es decision de producto. Sin el, un
   * typo produce una regla que nunca ve trafico y no da ningun sintoma.
   */
  it.each([['input'], ['forward'], ['postrouting'], ['srcnat'], ['dstnat'], ['preroutng'], ['inexistente']])(
    'rejects %s even though the router would accept it as a custom chain',
    (chain) => {
      expect(rejectionDetail(() => RawChain.create(chain))).to.contain('prerouting, output');
    },
  );

  it('rejects an empty chain', () => {
    expect(() => RawChain.create('   ')).toThrow();
  });
});

describe('RawAction', () => {
  const OBSERVED = [
    'accept',
    'drop',
    'log',
    'passthrough',
    'return',
    'jump',
    'add-src-to-address-list',
    'add-dst-to-address-list',
  ] as const;

  it.each(OBSERVED)('accepts the observed action %s', (action) => {
    expect(RawAction.create(action).value).to.equal(action);
  });

  it('accepts exactly eight actions and no more', () => {
    expect(OBSERVED).to.have.length(8);
  });

  /** Capacidad no certificada: `notrack` no se sondeo por su riesgo operativo. */
  it('rejects notrack, which is not certified yet', () => {
    expect(rejectionDetail(() => RawAction.create('notrack'))).to.contain('Debe ser una de');
  });

  it.each([['reject'], ['masquerade'], ['mark-packet'], ['fasttrack-connection'], ['inexistente']])(
    'rejects %s, which belongs to another resource or was never observed',
    (action) => {
      expect(() => RawAction.create(action)).toThrow();
    },
  );

  it('normalises case and whitespace', () => {
    expect(RawAction.create('  JUMP ').value).to.equal('jump');
  });

  describe('requiredCompanionField', () => {
    it('demands jumpTarget for jump', () => {
      expect(RawAction.create('jump').requiredCompanionField()).to.equal('jumpTarget');
    });

    it.each([['add-src-to-address-list'], ['add-dst-to-address-list']])('demands addressList for %s', (action) => {
      expect(RawAction.create(action).requiredCompanionField()).to.equal('addressList');
    });

    it.each([['accept'], ['drop'], ['log'], ['passthrough'], ['return']])('demands nothing for %s', (action) => {
      expect(RawAction.create(action).requiredCompanionField()).to.equal(null);
    });
  });
});

describe('RawRuleReference', () => {
  it('accepts letters, digits, dots, dashes and underscores', () => {
    expect(RawRuleReference.create('block_bogons.v1-2').value).to.equal('block_bogons.v1-2');
  });

  it('trims surrounding whitespace', () => {
    expect(RawRuleReference.create('  ref  ').value).to.equal('ref');
  });

  it.each([['   '], ['con espacio'], ['acento-ñ'], ['slash/no'], ['dos:puntos']])('rejects %s', (raw) => {
    expect(() => RawRuleReference.create(raw)).toThrow();
  });

  it('rejects a reference longer than 128 characters', () => {
    expect(rejectionDetail(() => RawRuleReference.create('a'.repeat(129)))).to.contain('128');
  });
});

describe('RawRuleComment', () => {
  const reference = RawRuleReference.create('block-bogons');

  it('builds the marker alone when there is no user comment', () => {
    expect(RawRuleComment.create(reference).value).to.equal('cuzonet:firewall-raw:block-bogons');
  });

  it('appends the user comment after the marker', () => {
    expect(RawRuleComment.create(reference, 'bloqueo de bogons').value).to.equal(
      'cuzonet:firewall-raw:block-bogons bloqueo de bogons',
    );
  });

  it('ignores a whitespace-only user comment', () => {
    expect(RawRuleComment.create(reference, '   ').value).to.equal('cuzonet:firewall-raw:block-bogons');
  });

  it('rejects a comment that exceeds 255 characters including the marker', () => {
    expect(rejectionDetail(() => RawRuleComment.create(reference, 'x'.repeat(255)))).to.contain('255');
  });

  /** El marcador es distinto del de los otros tres recursos a proposito. */
  it('uses a marker distinct from filter, nat and mangle', () => {
    const marker = RawRuleComment.create(reference).value;
    expect(marker).to.contain('cuzonet:firewall-raw:');
    for (const other of ['firewall-filter', 'firewall-nat', 'firewall-mangle']) {
      expect(marker).to.not.contain(other);
    }
  });

  describe('extractReference', () => {
    it('recovers the reference from a marked comment', () => {
      expect(RawRuleComment.extractReference('cuzonet:firewall-raw:ref extra')).to.equal('ref');
    });

    it.each([
      ['cuzonet:firewall-nat:ref'],
      ['sin marcador'],
      ['cuzonet:firewall-raw:'],
      [''],
    ])('returns null for %s', (comment) => {
      expect(RawRuleComment.extractReference(comment)).to.equal(null);
    });

    it.each([[undefined], [null]])('returns null for %s', (comment) => {
      expect(RawRuleComment.extractReference(comment)).to.equal(null);
    });
  });

  describe('parseOwnership', () => {
    it('classifies a managed comment as valid and recovers reference and user comment', () => {
      expect(RawRuleComment.parseOwnership('cuzonet:firewall-raw:ref  comentario del operador')).to.deep.equal({
        status: 'valid',
        ruleReference: 'ref',
        userComment: 'comentario del operador',
      });
    });

    it('omits userComment when the marker travels alone', () => {
      expect(RawRuleComment.parseOwnership('cuzonet:firewall-raw:ref')).to.deep.equal({
        status: 'valid',
        ruleReference: 'ref',
      });
    });

    it('classifies the marker prefix without a reference as malformed', () => {
      expect(RawRuleComment.parseOwnership('cuzonet:firewall-raw:')).to.deep.equal({ status: 'malformed' });
    });

    it.each([
      ['cuzonet:firewall-filter:algo'],
      ['cuzonet:firewall-nat:algo'],
      ['cuzonet:firewall-mangle:algo'],
      ['cuzonet:resource:algo'],
    ])('classifies another CuzoNet resource marker (%s) as foreign', (comment) => {
      expect(RawRuleComment.parseOwnership(comment)).to.deep.equal({ status: 'foreign' });
    });

    it.each([['puesta a mano'], [''], ['   ']])('classifies %s as unmanaged', (comment) => {
      expect(RawRuleComment.parseOwnership(comment)).to.deep.equal({ status: 'unmanaged' });
    });

    it.each([[undefined], [null]])('classifies %s as unmanaged', (comment) => {
      expect(RawRuleComment.parseOwnership(comment)).to.deep.equal({ status: 'unmanaged' });
    });

    /**
     * El parser produce EXACTAMENTE cuatro estados. No hay `legacy`: Raw nace con un unico
     * formato de marcador, asi que no hay formato historico que representar. Si apareciera un
     * quinto estado en el parser o en el tipo del puerto, esta prueba lo detecta.
     */
    it('produces exactly the four declared statuses across every comment shape', () => {
      const shapes = [
        'cuzonet:firewall-raw:ref',
        'cuzonet:firewall-raw:ref con texto',
        'cuzonet:firewall-raw:',
        'cuzonet:firewall-nat:otra',
        'cuzonet:resource:otra',
        'comentario libre',
        '',
        '   ',
      ];
      const produced = new Set(shapes.map((shape) => RawRuleComment.parseOwnership(shape).status));

      expect([...produced].sort()).to.deep.equal(['foreign', 'malformed', 'unmanaged', 'valid']);
    });

    it('only attaches ruleReference to the valid status', () => {
      for (const comment of ['cuzonet:firewall-raw:', 'cuzonet:firewall-nat:x', 'libre', '']) {
        expect(RawRuleComment.parseOwnership(comment).ruleReference, comment).to.equal(undefined);
      }
    });
  });
});
