import { describe, it, expect } from 'vitest';

import { routerOsNatRuleInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-nat-rule.input.js';

describe('routerOsNatRuleInputSchema', () => {
  it('validates a full masquerade add payload', () => {
    const payload = {
      action: 'masquerade',
      actionType: 'routeros.firewall.nat.add',
      chain: 'srcnat',
      comment: 'Salida a Internet',
      outInterface: 'ether1-wan',
      position: 0,
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a dst-nat (port forward) add payload with toAddresses/toPorts', () => {
    const payload = {
      action: 'dst-nat',
      actionType: 'routeros.firewall.nat.add',
      chain: 'dstnat',
      dstPort: '8080',
      protocol: 'tcp',
      routerId: 'router-1',
      ruleReference: 'forward-web',
      toAddresses: '192.168.1.10',
      toPorts: '80',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a netmap add payload with a to-addresses range', () => {
    const payload = {
      action: 'netmap',
      actionType: 'routeros.firewall.nat.add',
      chain: 'dstnat',
      routerId: 'router-1',
      ruleReference: 'netmap-range',
      toAddresses: '192.168.1.10-192.168.1.20',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects an invalid chain', () => {
    const payload = {
      action: 'masquerade',
      actionType: 'routeros.firewall.nat.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid action', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.nat.add',
      chain: 'srcnat',
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid toAddresses', () => {
    const payload = {
      action: 'dst-nat',
      actionType: 'routeros.firewall.nat.add',
      chain: 'dstnat',
      routerId: 'router-1',
      ruleReference: 'forward-web',
      toAddresses: 'not-an-address',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects a malformed toAddresses range', () => {
    const payload = {
      action: 'netmap',
      actionType: 'routeros.firewall.nat.add',
      chain: 'dstnat',
      routerId: 'router-1',
      ruleReference: 'netmap-range',
      toAddresses: '192.168.1.10-192.168.1.20-192.168.1.30',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid toPorts', () => {
    const payload = {
      action: 'dst-nat',
      actionType: 'routeros.firewall.nat.add',
      chain: 'dstnat',
      routerId: 'router-1',
      ruleReference: 'forward-web',
      toAddresses: '192.168.1.10',
      toPorts: '99999',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates a partial update payload', () => {
    const payload = {
      actionType: 'routeros.firewall.nat.update',
      disabled: true,
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a move payload requiring a position', () => {
    const payload = {
      actionType: 'routeros.firewall.nat.move',
      position: 2,
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects a move payload without a position', () => {
    const payload = {
      actionType: 'routeros.firewall.nat.move',
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates enable/disable/remove payloads', () => {
    for (const actionType of [
      'routeros.firewall.nat.enable',
      'routeros.firewall.nat.disable',
      'routeros.firewall.nat.remove',
    ]) {
      const payload = { actionType, routerId: 'router-1', ruleReference: 'wan-masquerade' };
      expect(routerOsNatRuleInputSchema.safeParse(payload).success, actionType).to.equal(true);
    }
  });

  it('rejects an unknown actionType', () => {
    const payload = {
      actionType: 'routeros.firewall.nat.unknown',
      routerId: 'router-1',
      ruleReference: 'wan-masquerade',
    };
    expect(routerOsNatRuleInputSchema.safeParse(payload).success).to.equal(false);
  });
});
