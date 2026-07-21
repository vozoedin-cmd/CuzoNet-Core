import { describe, it, expect } from 'vitest';

import { routerOsFilterRuleInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-filter-rule.input.js';

describe('routerOsFilterRuleInputSchema', () => {
  it('validates a full add payload', () => {
    const payload = {
      action: 'drop',
      actionType: 'routeros.firewall.filter.add',
      chain: 'input',
      comment: 'Bloquea SSH desde WAN',
      connectionState: 'new,established',
      disabled: false,
      dstPort: '22',
      inInterface: 'ether1-wan',
      position: 0,
      protocol: 'tcp',
      routerId: 'router-1',
      ruleReference: 'block-ssh-wan',
      srcAddress: '203.0.113.0/24',
    };
    const result = routerOsFilterRuleInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('validates a minimal add payload', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    const result = routerOsFilterRuleInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('rejects an invalid chain', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'not-a-chain',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid action', () => {
    const payload = {
      action: 'jump',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid protocol', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      protocol: 'not-a-protocol',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid srcAddress', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
      srcAddress: 'not-an-address',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid dstPort', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      dstPort: '99999',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('accepts a port list and range', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      dstPort: '80,443,1000-2000',
      routerId: 'router-1',
      ruleReference: 'allow-web',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects an invalid connectionState', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      connectionState: 'bogus',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects a negative position', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      position: -1,
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects a ruleReference with invalid characters', () => {
    const payload = {
      action: 'accept',
      actionType: 'routeros.firewall.filter.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'allow lan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates a partial update payload', () => {
    const payload = {
      actionType: 'routeros.firewall.filter.update',
      disabled: true,
      routerId: 'router-1',
      ruleReference: 'block-ssh-wan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a move payload requiring a position', () => {
    const payload = {
      actionType: 'routeros.firewall.filter.move',
      position: 3,
      routerId: 'router-1',
      ruleReference: 'block-ssh-wan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects a move payload without a position', () => {
    const payload = {
      actionType: 'routeros.firewall.filter.move',
      routerId: 'router-1',
      ruleReference: 'block-ssh-wan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates enable/disable/remove payloads', () => {
    for (const actionType of [
      'routeros.firewall.filter.enable',
      'routeros.firewall.filter.disable',
      'routeros.firewall.filter.remove',
    ]) {
      const payload = { actionType, routerId: 'router-1', ruleReference: 'block-ssh-wan' };
      expect(routerOsFilterRuleInputSchema.safeParse(payload).success, actionType).to.equal(true);
    }
  });

  it('rejects an unknown actionType', () => {
    const payload = {
      actionType: 'routeros.firewall.filter.unknown',
      routerId: 'router-1',
      ruleReference: 'block-ssh-wan',
    };
    expect(routerOsFilterRuleInputSchema.safeParse(payload).success).to.equal(false);
  });
});
