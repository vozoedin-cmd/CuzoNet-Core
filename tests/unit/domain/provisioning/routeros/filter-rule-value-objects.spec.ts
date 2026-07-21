import { describe, it, expect } from 'vitest';

import { ConnectionState } from '../../../../../backend/domain/provisioning/routeros/value-objects/connection-state.js';
import { FilterAction } from '../../../../../backend/domain/provisioning/routeros/value-objects/filter-action.js';
import { FilterRuleComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/filter-rule-comment.js';
import { FilterRulePosition } from '../../../../../backend/domain/provisioning/routeros/value-objects/filter-rule-position.js';
import { FilterRuleReference } from '../../../../../backend/domain/provisioning/routeros/value-objects/filter-rule-reference.js';
import { FirewallAddressSpec } from '../../../../../backend/domain/provisioning/routeros/value-objects/firewall-address-spec.js';
import { FirewallChain } from '../../../../../backend/domain/provisioning/routeros/value-objects/firewall-chain.js';
import { InterfaceName } from '../../../../../backend/domain/provisioning/routeros/value-objects/interface-name.js';
import { PortSpecification } from '../../../../../backend/domain/provisioning/routeros/value-objects/port-specification.js';
import { Protocol } from '../../../../../backend/domain/provisioning/routeros/value-objects/protocol.js';

describe('Firewall Filter Rule value objects', () => {
  describe('FilterRuleReference', () => {
    it('accepts a trimmed valid reference', () => {
      expect(FilterRuleReference.create(' block-ssh-wan ').value).to.equal('block-ssh-wan');
    });
    it('rejects an empty reference', () => {
      expect(() => FilterRuleReference.create('   ')).to.throw();
    });
    it('rejects a reference longer than 128 characters', () => {
      expect(() => FilterRuleReference.create('a'.repeat(129))).to.throw();
    });
    it('rejects characters outside the safe charset', () => {
      expect(() => FilterRuleReference.create('block ssh')).to.throw();
      expect(() => FilterRuleReference.create('block:ssh')).to.throw();
    });
    it('accepts letters, digits, dashes, underscores and dots', () => {
      expect(FilterRuleReference.create('block_ssh.v2-1').value).to.equal('block_ssh.v2-1');
    });
  });

  describe('FilterRuleComment', () => {
    it('builds a comment carrying only the marker when no user text is given', () => {
      const reference = FilterRuleReference.create('block-ssh-wan');
      const comment = FilterRuleComment.create(reference);
      expect(comment.value).to.equal('cuzonet:firewall-filter:block-ssh-wan');
      expect(comment.ruleReference).to.equal('block-ssh-wan');
    });
    it('appends trimmed user text after the marker', () => {
      const reference = FilterRuleReference.create('block-ssh-wan');
      const comment = FilterRuleComment.create(reference, '  Bloquea SSH desde WAN  ');
      expect(comment.value).to.equal('cuzonet:firewall-filter:block-ssh-wan Bloquea SSH desde WAN');
    });
    it('rejects a composed comment longer than 255 characters', () => {
      const reference = FilterRuleReference.create('block-ssh-wan');
      expect(() => FilterRuleComment.create(reference, 'a'.repeat(255))).to.throw();
    });
    it('extractReference recovers the marker from a full RouterOS comment', () => {
      expect(FilterRuleComment.extractReference('cuzonet:firewall-filter:block-ssh-wan extra text')).to.equal(
        'block-ssh-wan',
      );
    });
    it('extractReference returns null for comments without the marker', () => {
      expect(FilterRuleComment.extractReference('some unrelated comment')).to.equal(null);
      expect(FilterRuleComment.extractReference(undefined)).to.equal(null);
      expect(FilterRuleComment.extractReference('')).to.equal(null);
    });
  });

  describe('FirewallChain', () => {
    it('accepts the three built-in chains, case-insensitively', () => {
      expect(FirewallChain.create('Input').value).to.equal('input');
      expect(FirewallChain.create('forward').value).to.equal('forward');
      expect(FirewallChain.create('OUTPUT').value).to.equal('output');
    });
    it('rejects a custom/jump-target chain', () => {
      expect(() => FirewallChain.create('my-custom-chain')).to.throw();
    });
  });

  describe('FilterAction', () => {
    it('accepts the supported actions', () => {
      expect(FilterAction.create('accept').value).to.equal('accept');
      expect(FilterAction.create('DROP').value).to.equal('drop');
      expect(FilterAction.create('reject').value).to.equal('reject');
    });
    it('rejects an unsupported action', () => {
      expect(() => FilterAction.create('jump')).to.throw();
    });
  });

  describe('Protocol', () => {
    it('accepts known protocol keywords', () => {
      expect(Protocol.create('TCP').value).to.equal('tcp');
      expect(Protocol.create('udp').value).to.equal('udp');
    });
    it('accepts a numeric protocol id in range', () => {
      expect(Protocol.create('47').value).to.equal('47');
    });
    it('rejects an out-of-range numeric protocol', () => {
      expect(() => Protocol.create('256')).to.throw();
    });
    it('rejects an unknown protocol keyword', () => {
      expect(() => Protocol.create('not-a-protocol')).to.throw();
    });
  });

  describe('FirewallAddressSpec', () => {
    it('accepts a plain IPv4 address', () => {
      expect(FirewallAddressSpec.create('192.168.1.10').value).to.equal('192.168.1.10');
    });
    it('accepts a CIDR range', () => {
      expect(FirewallAddressSpec.create('10.0.0.0/24').value).to.equal('10.0.0.0/24');
    });
    it('accepts and preserves negation', () => {
      expect(FirewallAddressSpec.create('!10.0.0.0/24').value).to.equal('!10.0.0.0/24');
    });
    it('rejects an invalid address', () => {
      expect(() => FirewallAddressSpec.create('not-an-address')).to.throw();
    });
  });

  describe('PortSpecification', () => {
    it('accepts a single port', () => {
      expect(PortSpecification.create('443').value).to.equal('443');
    });
    it('accepts a comma-separated list', () => {
      expect(PortSpecification.create('80,443').value).to.equal('80,443');
    });
    it('accepts a range', () => {
      expect(PortSpecification.create('1000-2000').value).to.equal('1000-2000');
    });
    it('accepts a mix of ports and ranges', () => {
      expect(PortSpecification.create('80,443,1000-2000').value).to.equal('80,443,1000-2000');
    });
    it('rejects port 0 and ports above 65535', () => {
      expect(() => PortSpecification.create('0')).to.throw();
      expect(() => PortSpecification.create('65536')).to.throw();
    });
    it('rejects a malformed range', () => {
      expect(() => PortSpecification.create('1000-2000-3000')).to.throw();
    });
  });

  describe('InterfaceName', () => {
    it('accepts a typical RouterOS interface name', () => {
      expect(InterfaceName.create('ether1').value).to.equal('ether1');
      expect(InterfaceName.create('bridge-lan').value).to.equal('bridge-lan');
    });
    it('rejects an empty interface name', () => {
      expect(() => InterfaceName.create('  ')).to.throw();
    });
    it('rejects a name starting with a special character', () => {
      expect(() => InterfaceName.create('-ether1')).to.throw();
    });
  });

  describe('ConnectionState', () => {
    it('accepts a single known state', () => {
      expect(ConnectionState.create('established').value).to.equal('established');
    });
    it('accepts and normalizes a comma-separated list', () => {
      expect(ConnectionState.create('Established, Related').value).to.equal('established,related');
    });
    it('rejects an unknown state', () => {
      expect(() => ConnectionState.create('bogus')).to.throw();
    });
  });

  describe('FilterRulePosition', () => {
    it('accepts zero and positive integers', () => {
      expect(FilterRulePosition.create(0).value).to.equal(0);
      expect(FilterRulePosition.create(5).value).to.equal(5);
    });
    it('rejects negative numbers', () => {
      expect(() => FilterRulePosition.create(-1)).to.throw();
    });
    it('rejects non-integers', () => {
      expect(() => FilterRulePosition.create(1.5)).to.throw();
    });
  });
});
