import { describe, it, expect } from 'vitest';

import { routerOsAddressListInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-address-list.input.js';

describe('routerOsAddressListInputSchema', () => {
  it('validates a correct add payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      comment: 'cliente moroso',
      disabled: false,
      list: 'blocked-ips',
      routerId: 'router-1',
      timeout: '1d',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a minimal add payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: '10.0.0.0/24',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('rejects an invalid IP address', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: 'not-an-address',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('rejects an empty list name', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      list: '',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('rejects an invalid timeout format', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      list: 'blocked-ips',
      routerId: 'router-1',
      timeout: 'forever',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('accepts a "none" timeout', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.add',
      address: '192.168.1.10',
      list: 'blocked-ips',
      routerId: 'router-1',
      timeout: 'none',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct update payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.update',
      address: '192.168.1.10',
      comment: 'actualizado',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct enable payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.enable',
      address: '192.168.1.10',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct disable payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.disable',
      address: '192.168.1.10',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a correct remove payload', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.remove',
      address: '192.168.1.10',
      list: 'blocked-ips',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('rejects an unknown actionType', () => {
    const payload = {
      actionType: 'routeros.firewall.address-list.unknown',
      routerId: 'router-1',
    };
    const result = routerOsAddressListInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });
});
