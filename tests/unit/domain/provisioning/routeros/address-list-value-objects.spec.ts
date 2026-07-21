import { describe, it, expect } from 'vitest';

import { AddressComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/address-comment.js';
import { AddressListName } from '../../../../../backend/domain/provisioning/routeros/value-objects/address-list-name.js';
import { DisabledState } from '../../../../../backend/domain/provisioning/routeros/value-objects/disabled-state.js';
import { IpAddress } from '../../../../../backend/domain/provisioning/routeros/value-objects/ip-address.js';
import { Timeout } from '../../../../../backend/domain/provisioning/routeros/value-objects/timeout.js';

describe('Firewall Address List value objects', () => {
  describe('AddressListName', () => {
    it('accepts a trimmed valid name', () => {
      expect(AddressListName.create(' blocked-ips ').value).to.equal('blocked-ips');
    });
    it('rejects an empty name', () => {
      expect(() => AddressListName.create('   ')).to.throw();
    });
    it('rejects control characters', () => {
      expect(() => AddressListName.create('blocked\nips')).to.throw();
    });
    it('rejects names longer than 64 characters', () => {
      expect(() => AddressListName.create('a'.repeat(65))).to.throw();
    });
  });

  describe('IpAddress', () => {
    it('accepts a plain IPv4 address', () => {
      expect(IpAddress.create('192.168.1.10').value).to.equal('192.168.1.10');
    });
    it('accepts an IPv4 address with CIDR', () => {
      expect(IpAddress.create('10.0.0.0/24').value).to.equal('10.0.0.0/24');
    });
    it('accepts a plain IPv6 address', () => {
      expect(IpAddress.create('2001:db8::1').value).to.equal('2001:db8::1');
    });
    it('accepts an IPv6 address with CIDR', () => {
      expect(IpAddress.create('2001:db8::/32').value).to.equal('2001:db8::/32');
    });
    it('rejects an out-of-range IPv4 octet', () => {
      expect(() => IpAddress.create('999.1.1.1')).to.throw();
    });
    it('rejects an invalid CIDR suffix', () => {
      expect(() => IpAddress.create('10.0.0.0/99')).to.throw();
    });
    it('rejects a non-address string', () => {
      expect(() => IpAddress.create('not-an-address')).to.throw();
    });
  });

  describe('AddressComment', () => {
    it('accepts an empty comment', () => {
      expect(AddressComment.create('').value).to.equal('');
    });
    it('rejects a comment over 255 characters', () => {
      expect(() => AddressComment.create('a'.repeat(256))).to.throw();
    });
    it('rejects control characters', () => {
      expect(() => AddressComment.create('bad\ncomment')).to.throw();
    });
  });

  describe('Timeout', () => {
    it('accepts "none"', () => {
      expect(Timeout.create('none').isPermanent()).to.equal(true);
    });
    it('is case-insensitive for "none"', () => {
      expect(Timeout.create('NoNe').value).to.equal('none');
    });
    it('accepts a compound duration', () => {
      const timeout = Timeout.create('1d');
      expect(timeout.value).to.equal('1d');
      expect(timeout.isPermanent()).to.equal(false);
    });
    it('accepts a clock-form duration', () => {
      expect(Timeout.create('00:30:00').value).to.equal('00:30:00');
    });
    it('rejects an invalid duration', () => {
      expect(() => Timeout.create('forever')).to.throw();
    });
  });

  describe('DisabledState', () => {
    it('reports enabled/disabled correctly', () => {
      expect(DisabledState.enabled().isEnabled()).to.equal(true);
      expect(DisabledState.enabled().isDisabled()).to.equal(false);
      expect(DisabledState.disabled().isDisabled()).to.equal(true);
    });
    it('serializes to the RouterOS yes/no wire flag', () => {
      expect(DisabledState.enabled().toRouterOsFlag()).to.equal('no');
      expect(DisabledState.disabled().toRouterOsFlag()).to.equal('yes');
    });
    it('create() mirrors the given boolean', () => {
      expect(DisabledState.create(true).value).to.equal(true);
      expect(DisabledState.create(false).value).to.equal(false);
    });
  });
});
