import { describe, it, expect } from 'vitest';

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
});
