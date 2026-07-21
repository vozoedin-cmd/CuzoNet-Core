import { describe, it, expect } from 'vitest';

import { routerOsMangleRuleInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-mangle-rule.input.js';

describe('routerOsMangleRuleInputSchema', () => {
  it('validates a full mark-connection add payload', () => {
    const payload = {
      action: 'mark-connection',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'prerouting',
      comment: 'Marca conexiones VoIP',
      newConnectionMark: 'voip-conn',
      passthrough: true,
      position: 0,
      protocol: 'udp',
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a mark-packet add payload matching on an existing connectionMark', () => {
    const payload = {
      action: 'mark-packet',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'forward',
      connectionMark: 'voip-conn',
      newPacketMark: 'voip-packet',
      routerId: 'router-1',
      ruleReference: 'mark-voip-packet',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a mark-routing add payload', () => {
    const payload = {
      action: 'mark-routing',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'prerouting',
      newRoutingMark: 'to-isp-2',
      routerId: 'router-1',
      ruleReference: 'route-isp-2',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a passthrough add payload without any mark', () => {
    const payload = {
      action: 'passthrough',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'noop-rule',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects an invalid chain', () => {
    const payload = {
      action: 'passthrough',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'srcnat',
      routerId: 'router-1',
      ruleReference: 'noop-rule',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects a Phase 2 action', () => {
    const payload = {
      action: 'change-ttl',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'noop-rule',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('rejects an invalid mark name', () => {
    const payload = {
      action: 'mark-connection',
      actionType: 'routeros.firewall.mangle.add',
      chain: 'prerouting',
      newConnectionMark: 'voip conn',
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates a partial update payload', () => {
    const payload = {
      actionType: 'routeros.firewall.mangle.update',
      disabled: true,
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('validates a move payload requiring a position', () => {
    const payload = {
      actionType: 'routeros.firewall.mangle.move',
      position: 1,
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(true);
  });

  it('rejects a move payload without a position', () => {
    const payload = {
      actionType: 'routeros.firewall.mangle.move',
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(false);
  });

  it('validates enable/disable/remove payloads', () => {
    for (const actionType of [
      'routeros.firewall.mangle.enable',
      'routeros.firewall.mangle.disable',
      'routeros.firewall.mangle.remove',
    ]) {
      const payload = { actionType, routerId: 'router-1', ruleReference: 'mark-voip-conn' };
      expect(routerOsMangleRuleInputSchema.safeParse(payload).success, actionType).to.equal(true);
    }
  });

  it('rejects an unknown actionType', () => {
    const payload = {
      actionType: 'routeros.firewall.mangle.unknown',
      routerId: 'router-1',
      ruleReference: 'mark-voip-conn',
    };
    expect(routerOsMangleRuleInputSchema.safeParse(payload).success).to.equal(false);
  });
});
