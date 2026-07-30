import { describe, it, expect } from 'vitest';

import { routerOsAddressListInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-address-list.input.js';

const parse = (payload: unknown) => routerOsAddressListInputSchema.safeParse(payload);

const ACTION_TYPES = [
  'routeros.firewall.address-list.add',
  'routeros.firewall.address-list.update',
  'routeros.firewall.address-list.enable',
  'routeros.firewall.address-list.disable',
  'routeros.firewall.address-list.remove',
] as const;

describe('routerOsAddressListInputSchema', () => {
  it('validates a correct add payload', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      comment: 'cliente moroso',
      disabled: false,
      list: 'blocked-ips',
      routerId: 'router-1',
    }).success).to.equal(true);
  });

  it('validates a minimal add payload', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.add',
      address: '10.0.0.0/24',
      list: 'blocked-ips',
      routerId: 'router-1',
    }).success).to.equal(true);
  });

  it('rejects an invalid IP address', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.add',
      address: 'not-an-address',
      list: 'blocked-ips',
      routerId: 'router-1',
    }).success).to.equal(false);
  });

  it('rejects an empty list name', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      list: '',
      routerId: 'router-1',
    }).success).to.equal(false);
  });

  describe('timeout is out of the contract', () => {
    // Fijar timeout convierte la entrada en dynamic=true en RouterOS 7.21.4: efimera, no
    // deshabilitable y con un valor que /print devuelve como cuenta regresiva. Un payload
    // que lo lleve debe fallar, no aceptarse y descartarse en silencio.
    it.each(ACTION_TYPES)('rejects timeout on %s', (actionType) => {
      const result = parse({
        actionType,
        address: '192.168.1.10',
        list: 'blocked-ips',
        routerId: 'router-1',
        timeout: '1d',
      });

      expect(result.success).to.equal(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).to.equal(true);
      }
    });

    it('rejects timeout "none" as well', () => {
      expect(parse({
        actionType: 'routeros.firewall.address-list.add',
        address: '192.168.1.10',
        list: 'blocked-ips',
        routerId: 'router-1',
        timeout: 'none',
      }).success).to.equal(false);
    });
  });

  describe('strict schemas', () => {
    it.each(ACTION_TYPES)('rejects unknown fields on %s', (actionType) => {
      expect(parse({
        actionType,
        address: '192.168.1.10',
        dynamic: true,
        list: 'blocked-ips',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects read-only router properties', () => {
      for (const field of ['creationTime', 'creation-time', 'id', '.id']) {
        expect(parse({
          actionType: 'routeros.firewall.address-list.add',
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
          [field]: 'x',
        }).success, field).to.equal(false);
      }
    });

    it('rejects configuration fields on enable/disable/remove', () => {
      for (const actionType of ACTION_TYPES.slice(2)) {
        expect(parse({
          actionType,
          address: '192.168.1.10',
          comment: 'no aplica',
          list: 'blocked-ips',
          routerId: 'router-1',
        }).success, actionType).to.equal(false);
      }
    });
  });

  describe('address formats', () => {
    it('accepts an IPv4 range', () => {
      expect(parse({
        actionType: 'routeros.firewall.address-list.add',
        address: '203.0.113.10-203.0.113.15',
        list: 'blocked-ips',
        routerId: 'router-1',
      }).success).to.equal(true);
    });

    it('rejects an inverted IPv4 range', () => {
      expect(parse({
        actionType: 'routeros.firewall.address-list.add',
        address: '203.0.113.15-203.0.113.10',
        list: 'blocked-ips',
        routerId: 'router-1',
      }).success).to.equal(false);
    });

    it('rejects IPv6, which belongs to /ipv6/firewall/address-list', () => {
      for (const address of ['2001:db8::1', '2001:db8::/32']) {
        expect(parse({
          actionType: 'routeros.firewall.address-list.add',
          address,
          list: 'blocked-ips',
          routerId: 'router-1',
        }).success, address).to.equal(false);
      }
    });

    it('rejects a domain name, which RouterOS would expand into dynamic child entries', () => {
      expect(parse({
        actionType: 'routeros.firewall.address-list.add',
        address: 'example.com',
        list: 'blocked-ips',
        routerId: 'router-1',
      }).success).to.equal(false);
    });
  });

  it('validates a correct update payload', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.update',
      address: '192.168.1.10',
      comment: 'actualizado',
      list: 'blocked-ips',
      routerId: 'router-1',
    }).success).to.equal(true);
  });

  it('validates correct enable, disable and remove payloads', () => {
    for (const actionType of ACTION_TYPES.slice(2)) {
      expect(parse({
        actionType,
        address: '192.168.1.10',
        list: 'blocked-ips',
        routerId: 'router-1',
      }).success, actionType).to.equal(true);
    }
  });

  it('rejects an unknown actionType', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.unknown',
      routerId: 'router-1',
    }).success).to.equal(false);
  });

  it('rejects a missing routerId', () => {
    expect(parse({
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      list: 'blocked-ips',
    }).success).to.equal(false);
  });
});
