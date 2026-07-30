import { describe, it, expect } from 'vitest';

import { AddressComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/address-comment.js';
import { AddressListName } from '../../../../../backend/domain/provisioning/routeros/value-objects/address-list-name.js';
import { DisabledState } from '../../../../../backend/domain/provisioning/routeros/value-objects/disabled-state.js';
import { InvalidProvisioningDataError } from '../../../../../backend/domain/provisioning/errors/invalid-provisioning-data.error.js';
import { IpAddress } from '../../../../../backend/domain/provisioning/routeros/value-objects/ip-address.js';

/**
 * `InvalidProvisioningDataError` lleva siempre el mismo `message` generico; el motivo
 * concreto vive en `details[0].message`, que es lo que debe afirmarse.
 */
function expectRejection(address: string, reason: RegExp): void {
  try {
    IpAddress.create(address);
    expect.fail(`IpAddress.create('${address}') deberia haber lanzado`);
  } catch (error) {
    expect(error, address).to.be.instanceOf(InvalidProvisioningDataError);
    expect((error as InvalidProvisioningDataError).details?.[0]?.message, address).to.match(reason);
  }
}

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
    it('rejects an out-of-range IPv4 octet', () => {
      expect(() => IpAddress.create('999.1.1.1')).to.throw();
    });
    it('rejects an invalid CIDR suffix', () => {
      expect(() => IpAddress.create('10.0.0.0/99')).to.throw();
    });
    it('rejects a non-address string', () => {
      expect(() => IpAddress.create('not-an-address')).to.throw();
    });

    describe('IPv4 ranges', () => {
      // RouterOS 7.21.4 acepta el rango y /print lo devuelve literal, sin normalizar.
      it('accepts a range and preserves it verbatim', () => {
        expect(IpAddress.create('203.0.113.10-203.0.113.15').value).to.equal('203.0.113.10-203.0.113.15');
      });
      it('accepts a range whose endpoints are equal', () => {
        expect(IpAddress.create('203.0.113.10-203.0.113.10').value).to.equal('203.0.113.10-203.0.113.10');
      });
      it('accepts a range that spans octet boundaries', () => {
        expect(IpAddress.create('10.0.0.250-10.0.1.5').value).to.equal('10.0.0.250-10.0.1.5');
      });
      it('rejects an inverted range', () => {
        expectRejection('203.0.113.15-203.0.113.10', /no puede ser mayor que su final/);
      });
      it('rejects CIDR notation on a range endpoint', () => {
        expectRejection('203.0.113.0/24-203.0.113.15', /sin prefijo CIDR/);
      });
      it('rejects the abbreviated range form RouterOS was never confirmed to accept', () => {
        expect(() => IpAddress.create('203.0.113.10-15')).to.throw();
      });
    });

    describe('formats deliberately kept out of the contract', () => {
      // /ip/firewall/address-list es la tabla IPv4; IPv6 vive en /ipv6/firewall/address-list.
      it('rejects a plain IPv6 address with an IPv6-specific message', () => {
        expectRejection('2001:db8::1', /IPv6 no se admiten/);
      });
      it('rejects an IPv6 address with CIDR', () => {
        expectRejection('2001:db8::/32', /IPv6 no se admiten/);
      });
      // RouterOS resolveria el nombre y crearia entradas hijas dinamicas.
      it('rejects a domain name', () => {
        expectRejection('example.com', /nombres de dominio/);
      });
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
