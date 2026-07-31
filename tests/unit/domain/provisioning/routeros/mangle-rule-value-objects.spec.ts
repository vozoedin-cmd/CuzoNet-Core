import { describe, it, expect } from 'vitest';
import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';

import { MangleAction } from '../../../../../backend/domain/provisioning/routeros/value-objects/mangle-action.js';
import { MangleChain } from '../../../../../backend/domain/provisioning/routeros/value-objects/mangle-chain.js';
import { MangleMarkName } from '../../../../../backend/domain/provisioning/routeros/value-objects/mangle-mark-name.js';
import { MangleRuleComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/mangle-rule-comment.js';
import { MangleRuleReference } from '../../../../../backend/domain/provisioning/routeros/value-objects/mangle-rule-reference.js';

describe('Mangle rule value objects', () => {
  describe('MangleChain', () => {
    it('accepts the five standard Mangle chains, case-insensitively', () => {
      expect(MangleChain.create('PreRouting').value).to.equal('prerouting');
      expect(MangleChain.create('input').value).to.equal('input');
      expect(MangleChain.create('forward').value).to.equal('forward');
      expect(MangleChain.create('output').value).to.equal('output');
      expect(MangleChain.create('POSTROUTING').value).to.equal('postrouting');
    });
    it('rejects an unknown chain', () => {
      expect(() => MangleChain.create('srcnat')).to.throw();
    });
  });

  describe('MangleAction', () => {
    it('accepts the four Phase 1 actions', () => {
      expect(MangleAction.create('MARK-CONNECTION').value).to.equal('mark-connection');
      expect(MangleAction.create('mark-packet').value).to.equal('mark-packet');
      expect(MangleAction.create('mark-routing').value).to.equal('mark-routing');
      expect(MangleAction.create('passthrough').value).to.equal('passthrough');
    });
    it('rejects a Phase 2 action', () => {
      expect(() => MangleAction.create('change-ttl')).to.throw();
      expect(() => MangleAction.create('jump')).to.throw();
    });

    describe('requiredNewMarkField', () => {
      it('maps each marking action to its corresponding new-*-mark field', () => {
        expect(MangleAction.create('mark-connection').requiredNewMarkField()).to.equal('newConnectionMark');
        expect(MangleAction.create('mark-packet').requiredNewMarkField()).to.equal('newPacketMark');
        expect(MangleAction.create('mark-routing').requiredNewMarkField()).to.equal('newRoutingMark');
      });
      it('is null for passthrough', () => {
        expect(MangleAction.create('passthrough').requiredNewMarkField()).to.equal(null);
      });
    });
  });

  describe('MangleMarkName', () => {
    it('accepts a trimmed valid mark name', () => {
      expect(MangleMarkName.create(' voip-conn ').value).to.equal('voip-conn');
    });
    it('rejects an empty mark name', () => {
      expect(() => MangleMarkName.create('   ')).to.throw();
    });
    it('rejects a mark name longer than 64 characters', () => {
      expect(() => MangleMarkName.create('a'.repeat(65))).to.throw();
    });
    it('rejects characters outside the safe charset', () => {
      expect(() => MangleMarkName.create('voip conn')).to.throw();
    });
  });

  describe('MangleRuleReference', () => {
    it('accepts a trimmed valid reference', () => {
      expect(MangleRuleReference.create(' mark-voip ').value).to.equal('mark-voip');
    });
    it('rejects an empty reference', () => {
      expect(() => MangleRuleReference.create('   ')).to.throw();
    });
  });

  describe('MangleRuleComment', () => {
    it('builds a comment with the Mangle-specific marker', () => {
      const reference = MangleRuleReference.create('mark-voip');
      const comment = MangleRuleComment.create(reference);
      expect(comment.value).to.equal('cuzonet:firewall-mangle:mark-voip');
      expect(comment.ruleReference).to.equal('mark-voip');
    });
    it('appends trimmed user text after the marker', () => {
      const reference = MangleRuleReference.create('mark-voip');
      const comment = MangleRuleComment.create(reference, '  Marca conexiones VoIP  ');
      expect(comment.value).to.equal('cuzonet:firewall-mangle:mark-voip Marca conexiones VoIP');
    });
    it('extractReference recovers the marker and does not match Filter/NAT markers', () => {
      expect(MangleRuleComment.extractReference('cuzonet:firewall-mangle:mark-voip extra')).to.equal('mark-voip');
      expect(MangleRuleComment.extractReference('cuzonet:firewall-filter:block-ssh-wan')).to.equal(null);
      expect(MangleRuleComment.extractReference('cuzonet:firewall-nat:wan-masquerade')).to.equal(null);
    });
  });

  describe('MangleRuleComment.parseOwnership', () => {
    it('reads a valid marker, its reference and the user comment', () => {
      expect(MangleRuleComment.parseOwnership('cuzonet:firewall-mangle:marca-voip prioridad')).to.deep.equal({
        ruleReference: 'marca-voip',
        status: 'valid',
        userComment: 'prioridad',
      });
    });

    it('omits userComment when the marker carries nothing else', () => {
      expect(MangleRuleComment.parseOwnership('cuzonet:firewall-mangle:marca-voip')).to.deep.equal({
        ruleReference: 'marca-voip',
        status: 'valid',
      });
    });

    it('classifies a marker of another CuzoNet resource as foreign', () => {
      for (const comment of ['cuzonet:firewall-filter:x', 'cuzonet:firewall-nat:y', 'cuzonet:resource:1']) {
        expect(MangleRuleComment.parseOwnership(comment).status, comment).to.equal('foreign');
      }
    });

    it('classifies a marker without a usable reference as malformed', () => {
      for (const comment of ['cuzonet:firewall-mangle:', 'cuzonet:firewall-mangle: con espacio']) {
        expect(MangleRuleComment.parseOwnership(comment).status, comment).to.equal('malformed');
      }
    });

    it('classifies anything else as unmanaged', () => {
      for (const comment of ['puesta a mano', '', '   ', undefined, null]) {
        expect(MangleRuleComment.parseOwnership(comment).status, String(comment)).to.equal('unmanaged');
      }
    });

    it('only the valid status carries a ruleReference', () => {
      const parsed = ['cuzonet:firewall-mangle:ok', 'cuzonet:otra', 'cuzonet:firewall-mangle:', 'a mano']
        .map((c) => MangleRuleComment.parseOwnership(c));

      expect(parsed[0]?.ruleReference).to.equal('ok');
      for (const entry of parsed.slice(1)) {
        expect(entry.ruleReference, entry.status).to.equal(undefined);
      }
    });

    it('produces exactly the four declared statuses, and no others', () => {
      const statuses = new Set(
        [
          'cuzonet:firewall-mangle:a libre',
          'cuzonet:firewall-mangle:b',
          'cuzonet:firewall-nat:c',
          'cuzonet:firewall-mangle:',
          'a mano',
          ' ',
        ].map((c) => MangleRuleComment.parseOwnership(c).status),
      );

      expect([...statuses].sort()).to.deep.equal(['foreign', 'malformed', 'unmanaged', 'valid']);
    });
  });

  /**
   * El default no es una preferencia de diseno: es lo que RouterOS 7.21.4 materializa. Se
   * observo creando reglas de sonda contra un hEX real y releyendolas de inmediato.
   * Cambiarlo sin nueva evidencia rompe la idempotencia del recurso.
   */
  describe('ROUTEROS_MANGLE_RULE_DEFAULTS', () => {
    it('declares passthrough as true, the value observed on RouterOS 7.21.4', () => {
      expect(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough).to.equal(true);
    });

    it('declares only the defaults actually observed', () => {
      expect(Object.keys(ROUTEROS_MANGLE_RULE_DEFAULTS)).to.deep.equal(['passthrough']);
    });
  });
});
