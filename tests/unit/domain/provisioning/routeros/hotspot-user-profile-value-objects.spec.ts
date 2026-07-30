import { describe, it, expect } from 'vitest';

import { InvalidProvisioningDataError } from '../../../../../backend/domain/provisioning/errors/invalid-provisioning-data.error.js';
import { HotspotAddressListName } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-address-list-name.js';
import { HotspotAddressPoolName } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-address-pool-name.js';
import { HotspotProfileDuration } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-profile-duration.js';
import { HotspotRateLimit } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-rate-limit.js';
import { HotspotSharedUsers } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-shared-users.js';

describe('Hotspot User Profile value objects', () => {
  describe('HotspotSharedUsers', () => {
    it('accepts positive integers', () => {
      expect(HotspotSharedUsers.create(1).value).to.equal(1);
      expect(HotspotSharedUsers.create(25).value).to.equal(25);
    });

    it('accepts the "unlimited" literal (the RouterOS default profile reports it)', () => {
      const vo = HotspotSharedUsers.create('unlimited');
      expect(vo.value).to.equal('unlimited');
      expect(vo.isUnlimited).to.equal(true);
      expect(vo.toRouterOs()).to.equal('unlimited');
    });

    it('accepts "unlimited" case-insensitively and normalizes it', () => {
      expect(HotspotSharedUsers.create('UNLIMITED').value).to.equal('unlimited');
    });

    it('serializes numbers exactly as RouterOS expects', () => {
      expect(HotspotSharedUsers.create(3).toRouterOs()).to.equal('3');
      expect(HotspotSharedUsers.create(3).isUnlimited).to.equal(false);
    });

    it('rejects zero and negatives', () => {
      expect(() => HotspotSharedUsers.create(0)).to.throw();
      expect(() => HotspotSharedUsers.create(-1)).to.throw();
    });

    it('rejects non-integers', () => {
      expect(() => HotspotSharedUsers.create(1.5)).to.throw();
    });

    it('rejects arbitrary strings', () => {
      expect(() => HotspotSharedUsers.create('many')).to.throw();
      expect(() => HotspotSharedUsers.create('')).to.throw();
      expect(() => HotspotSharedUsers.create('5')).to.throw(); // numeric strings must come as numbers
    });
  });

  describe('HotspotProfileDuration', () => {
    it('accepts compound RouterOS durations', () => {
      expect(HotspotProfileDuration.create('1h').value).to.equal('1h');
      expect(HotspotProfileDuration.create('4w2d').value).to.equal('4w2d');
      expect(HotspotProfileDuration.create('2m').value).to.equal('2m');
      expect(HotspotProfileDuration.create('3d').value).to.equal('3d');
    });

    it('accepts clock-style durations', () => {
      expect(HotspotProfileDuration.create('00:30:00').value).to.equal('00:30:00');
    });

    it('accepts the "none" literal (the RouterOS default for idle-timeout)', () => {
      const vo = HotspotProfileDuration.create('none');
      expect(vo.value).to.equal('none');
      expect(vo.isNone).to.equal(true);
    });

    it('normalizes "NONE" case-insensitively', () => {
      expect(HotspotProfileDuration.create('NONE').value).to.equal('none');
    });

    it('rejects malformed durations', () => {
      expect(() => HotspotProfileDuration.create('forever')).to.throw();
      expect(() => HotspotProfileDuration.create('10')).to.throw();
      expect(() => HotspotProfileDuration.create('')).to.throw();
      expect(() => HotspotProfileDuration.create('1x')).to.throw();
    });

    it('reports the offending field name in the error details', () => {
      let error: InvalidProvisioningDataError | undefined;
      try {
        HotspotProfileDuration.create('bad', 'sessionTimeout');
      } catch (e: unknown) {
        error = e as InvalidProvisioningDataError;
      }

      expect(error).to.be.instanceOf(InvalidProvisioningDataError);
      expect(error?.details?.[0]?.path).to.equal('sessionTimeout');
    });
  });

  describe('HotspotRateLimit', () => {
    it('accepts the RX/TX pair observed on a real router', () => {
      const vo = HotspotRateLimit.create('5M/5M');
      expect(vo.value).to.equal('5M/5M');
      expect(vo.rx).to.equal('5M');
      expect(vo.tx).to.equal('5M');
    });

    it('accepts asymmetric rates and k/G suffixes', () => {
      expect(HotspotRateLimit.create('5M/10M').value).to.equal('5M/10M');
      expect(HotspotRateLimit.create('512k/1G').value).to.equal('512k/1G');
    });

    it('accepts bare bit-per-second values', () => {
      expect(HotspotRateLimit.create('1000000/2000000').value).to.equal('1000000/2000000');
    });

    it('rejects a missing side', () => {
      expect(() => HotspotRateLimit.create('5M')).to.throw();
      expect(() => HotspotRateLimit.create('5M/')).to.throw();
      expect(() => HotspotRateLimit.create('/5M')).to.throw();
    });

    it('rejects more than two segments', () => {
      expect(() => HotspotRateLimit.create('5M/5M/5M')).to.throw();
    });

    it('rejects invalid units', () => {
      expect(() => HotspotRateLimit.create('5X/5M')).to.throw();
      expect(() => HotspotRateLimit.create('abc/def')).to.throw();
    });
  });

  describe('HotspotAddressPoolName', () => {
    it('accepts a pool name', () => {
      expect(HotspotAddressPoolName.create('POOL-HOTSPOT').value).to.equal('POOL-HOTSPOT');
    });

    it('accepts the "none" literal', () => {
      const vo = HotspotAddressPoolName.create('none');
      expect(vo.value).to.equal('none');
      expect(vo.isNone).to.equal(true);
    });

    it('rejects an empty value (use "none" instead)', () => {
      expect(() => HotspotAddressPoolName.create('')).to.throw();
      expect(() => HotspotAddressPoolName.create('   ')).to.throw();
    });

    it('rejects control characters', () => {
      expect(() => HotspotAddressPoolName.create('pool\nname')).to.throw();
    });
  });

  describe('HotspotAddressListName', () => {
    it('accepts a list name', () => {
      expect(HotspotAddressListName.create('hotspot-clients').value).to.equal('hotspot-clients');
    });

    it('accepts the empty string (the RouterOS default meaning "none")', () => {
      const vo = HotspotAddressListName.create('');
      expect(vo.value).to.equal('');
      expect(vo.isEmpty).to.equal(true);
    });

    it('rejects control characters', () => {
      expect(() => HotspotAddressListName.create('list\rname')).to.throw();
    });
  });
});
