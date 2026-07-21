import { describe, it, expect } from 'vitest';

import { HotspotComment } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-comment.js';
import { HotspotLimitBytes } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-limit-bytes.js';
import { HotspotLimitUptime } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-limit-uptime.js';
import { HotspotPassword } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-password.js';
import { HotspotProfileName } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-profile-name.js';
import { HotspotServerName } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-server-name.js';
import { HotspotSharedUsers } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-shared-users.js';
import { HotspotUsername } from '../../../../../backend/domain/provisioning/routeros/value-objects/hotspot-username.js';

describe('Hotspot value objects', () => {
  describe('HotspotUsername', () => {
    it('accepts a trimmed valid username', () => {
      expect(HotspotUsername.create(' cliente-1 ').value).to.equal('cliente-1');
    });
    it('rejects an empty username', () => {
      expect(() => HotspotUsername.create('   ')).to.throw();
    });
    it('rejects control characters', () => {
      expect(() => HotspotUsername.create('cliente\n1')).to.throw();
    });
    it('rejects usernames longer than 64 characters', () => {
      expect(() => HotspotUsername.create('a'.repeat(65))).to.throw();
    });
  });

  describe('HotspotPassword', () => {
    it('accepts a valid password', () => {
      expect(HotspotPassword.create('secret123').value).to.equal('secret123');
    });
    it('rejects an empty password', () => {
      expect(() => HotspotPassword.create('')).to.throw();
    });
  });

  describe('HotspotProfileName', () => {
    it('accepts a valid profile name', () => {
      expect(HotspotProfileName.create('default').value).to.equal('default');
    });
    it('rejects an empty profile name', () => {
      expect(() => HotspotProfileName.create('')).to.throw();
    });
  });

  describe('HotspotServerName', () => {
    it('accepts a valid server name', () => {
      expect(HotspotServerName.create('hotspot1').value).to.equal('hotspot1');
    });
    it('rejects an empty server name', () => {
      expect(() => HotspotServerName.create('')).to.throw();
    });
  });

  describe('HotspotComment', () => {
    it('accepts an empty comment', () => {
      expect(HotspotComment.create('').value).to.equal('');
    });
    it('rejects a comment over 255 characters', () => {
      expect(() => HotspotComment.create('a'.repeat(256))).to.throw();
    });
  });

  describe('HotspotLimitUptime', () => {
    it('accepts a compound duration', () => {
      expect(HotspotLimitUptime.create('4h30m').value).to.equal('4h30m');
    });
    it('accepts a clock-form duration', () => {
      expect(HotspotLimitUptime.create('01:30:00').value).to.equal('01:30:00');
    });
    it('rejects an invalid duration', () => {
      expect(() => HotspotLimitUptime.create('forever')).to.throw();
    });
  });

  describe('HotspotLimitBytes', () => {
    it('accepts zero and positive integers', () => {
      expect(HotspotLimitBytes.create(0).value).to.equal(0);
      expect(HotspotLimitBytes.create(1_000_000).value).to.equal(1_000_000);
    });
    it('rejects negative values', () => {
      expect(() => HotspotLimitBytes.create(-1)).to.throw();
    });
    it('rejects non-integer values', () => {
      expect(() => HotspotLimitBytes.create(1.5)).to.throw();
    });
  });

  describe('HotspotSharedUsers', () => {
    it('accepts positive integers', () => {
      expect(HotspotSharedUsers.create(3).value).to.equal(3);
    });
    it('rejects zero', () => {
      expect(() => HotspotSharedUsers.create(0)).to.throw();
    });
    it('rejects non-integer values', () => {
      expect(() => HotspotSharedUsers.create(1.5)).to.throw();
    });
  });
});
