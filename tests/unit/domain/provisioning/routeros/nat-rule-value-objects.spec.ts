import { describe, it, expect } from 'vitest';

import { NatAction } from '../../../../../backend/domain/provisioning/routeros/value-objects/nat-action.js';
import { NatChain } from '../../../../../backend/domain/provisioning/routeros/value-objects/nat-chain.js';
import { NatRuleComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/nat-rule-comment.js';
import { NatRuleReference } from '../../../../../backend/domain/provisioning/routeros/value-objects/nat-rule-reference.js';
import { NatToAddress } from '../../../../../backend/domain/provisioning/routeros/value-objects/nat-to-address.js';

describe('NAT rule value objects', () => {
  describe('NatChain', () => {
    it('accepts srcnat and dstnat, case-insensitively', () => {
      expect(NatChain.create('SrcNat').value).to.equal('srcnat');
      expect(NatChain.create('dstnat').value).to.equal('dstnat');
    });
    it('rejects an unknown chain', () => {
      expect(() => NatChain.create('forward')).to.throw();
    });
  });

  describe('NatAction', () => {
    it('accepts the five supported NAT actions', () => {
      expect(NatAction.create('MASQUERADE').value).to.equal('masquerade');
      expect(NatAction.create('src-nat').value).to.equal('src-nat');
      expect(NatAction.create('dst-nat').value).to.equal('dst-nat');
      expect(NatAction.create('netmap').value).to.equal('netmap');
      expect(NatAction.create('redirect').value).to.equal('redirect');
    });
    it('rejects an unsupported action', () => {
      expect(() => NatAction.create('accept')).to.throw();
    });

    describe('isCompatibleWith', () => {
      it('allows masquerade and src-nat only on srcnat', () => {
        expect(NatAction.create('masquerade').isCompatibleWith('srcnat')).to.equal(true);
        expect(NatAction.create('src-nat').isCompatibleWith('srcnat')).to.equal(true);
        expect(NatAction.create('masquerade').isCompatibleWith('dstnat')).to.equal(false);
      });
      it('allows dst-nat and redirect only on dstnat', () => {
        expect(NatAction.create('dst-nat').isCompatibleWith('dstnat')).to.equal(true);
        expect(NatAction.create('redirect').isCompatibleWith('dstnat')).to.equal(true);
        expect(NatAction.create('dst-nat').isCompatibleWith('srcnat')).to.equal(false);
      });
      it('allows netmap on both chains', () => {
        expect(NatAction.create('netmap').isCompatibleWith('srcnat')).to.equal(true);
        expect(NatAction.create('netmap').isCompatibleWith('dstnat')).to.equal(true);
      });
    });

    describe('requiresToAddresses', () => {
      it('is true for translating actions', () => {
        expect(NatAction.create('src-nat').requiresToAddresses()).to.equal(true);
        expect(NatAction.create('dst-nat').requiresToAddresses()).to.equal(true);
        expect(NatAction.create('netmap').requiresToAddresses()).to.equal(true);
      });
      it('is false for masquerade and redirect', () => {
        expect(NatAction.create('masquerade').requiresToAddresses()).to.equal(false);
        expect(NatAction.create('redirect').requiresToAddresses()).to.equal(false);
      });
    });
  });

  describe('NatRuleReference', () => {
    it('accepts a trimmed valid reference', () => {
      expect(NatRuleReference.create(' wan-masquerade ').value).to.equal('wan-masquerade');
    });
    it('rejects an empty reference', () => {
      expect(() => NatRuleReference.create('   ')).to.throw();
    });
    it('rejects characters outside the safe charset', () => {
      expect(() => NatRuleReference.create('wan masquerade')).to.throw();
    });
  });

  describe('NatRuleComment', () => {
    it('builds a comment with the NAT-specific marker', () => {
      const reference = NatRuleReference.create('wan-masquerade');
      const comment = NatRuleComment.create(reference);
      expect(comment.value).to.equal('cuzonet:firewall-nat:wan-masquerade');
      expect(comment.ruleReference).to.equal('wan-masquerade');
    });
    it('appends trimmed user text after the marker', () => {
      const reference = NatRuleReference.create('wan-masquerade');
      const comment = NatRuleComment.create(reference, '  Salida a Internet  ');
      expect(comment.value).to.equal('cuzonet:firewall-nat:wan-masquerade Salida a Internet');
    });
    it('extractReference recovers the marker and does not match a Filter Rule marker', () => {
      expect(NatRuleComment.extractReference('cuzonet:firewall-nat:wan-masquerade extra')).to.equal(
        'wan-masquerade',
      );
      expect(NatRuleComment.extractReference('cuzonet:firewall-filter:block-ssh-wan')).to.equal(null);
    });
  });

  describe('NatToAddress', () => {
    it('accepts a single IPv4 address', () => {
      expect(NatToAddress.create('192.168.1.10').value).to.equal('192.168.1.10');
    });
    it('accepts a CIDR network (netmap)', () => {
      expect(NatToAddress.create('10.0.0.0/24').value).to.equal('10.0.0.0/24');
    });
    it('accepts an IPv4 range', () => {
      expect(NatToAddress.create('192.168.1.10-192.168.1.20').value).to.equal('192.168.1.10-192.168.1.20');
    });
    it('rejects a malformed range', () => {
      expect(() => NatToAddress.create('192.168.1.10-not-an-ip')).to.throw();
    });
    it('rejects a range with more than two segments', () => {
      expect(() => NatToAddress.create('192.168.1.10-192.168.1.20-192.168.1.30')).to.throw();
    });
    it('rejects an invalid address', () => {
      expect(() => NatToAddress.create('not-an-address')).to.throw();
    });
  });
});
