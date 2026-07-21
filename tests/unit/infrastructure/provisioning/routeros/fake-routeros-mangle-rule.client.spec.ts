import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient Mangle rules', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('creates a rule, parsing its ruleReference from the Mangle comment marker', async () => {
    await client.createMangleRule({
      action: 'mark-connection',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-mangle:mark-voip-conn Marca VoIP',
      newConnectionMark: 'voip-conn',
    });

    expect(client.mangleRules).to.have.length(1);
    expect(client.mangleRules[0]).to.include({
      action: 'mark-connection',
      chain: 'prerouting',
      disabled: false,
      newConnectionMark: 'voip-conn',
      ruleReference: 'mark-voip-conn',
    });
    expect(client.mangleRules[0]?.id).to.match(/^\*\d+$/);
  });

  it('stores match marks (connectionMark/packetMark/routingMark) separately from set marks', async () => {
    await client.createMangleRule({
      action: 'mark-packet',
      chain: 'forward',
      comment: 'cuzonet:firewall-mangle:mark-voip-packet',
      connectionMark: 'voip-conn',
      newPacketMark: 'voip-packet',
    });

    expect(client.mangleRules[0]).to.include({ connectionMark: 'voip-conn', newPacketMark: 'voip-packet' });
  });

  it('stores the passthrough flag', async () => {
    await client.createMangleRule({
      action: 'mark-connection',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-mangle:r1',
      newConnectionMark: 'm1',
      passthrough: false,
    });

    expect(client.mangleRules[0]?.passthrough).to.equal(false);
  });

  it('finds a rule by ruleReference and by id, keeping it separate from filter/NAT rules', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:shared-ref' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:shared-ref' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:shared-ref' });
    const created = client.mangleRules[0]!;

    expect(await client.findMangleRule({ ruleReference: 'shared-ref' })).to.include({ id: created.id });
    expect(await client.findMangleRule({ id: created.id })).to.include({ ruleReference: 'shared-ref' });
    expect(client.filterRules).to.have.length(1);
    expect(client.natRules).to.have.length(1);
    expect(client.mangleRules).to.have.length(1);
  });

  it('appends new rules at the end by default and inserts before a given placeBeforeId', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
    const r1Id = client.mangleRules[0]!.id;

    await client.createMangleRule({
      action: 'passthrough',
      chain: 'forward',
      comment: 'cuzonet:firewall-mangle:r0',
      placeBeforeId: r1Id,
    });

    expect(client.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r0', 'r1', 'r2']);
  });

  it('enables and disables a rule in place, preserving order', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });

    await client.disableMangleRule({ ruleReference: 'r1' });
    expect(client.mangleRules.map((r) => r.disabled)).to.deep.equal([true, false]);

    await client.enableMangleRule({ ruleReference: 'r1' });
    expect(client.mangleRules[0]?.disabled).to.equal(false);
  });

  it('updates only the provided fields without changing position', async () => {
    await client.createMangleRule({ action: 'mark-routing', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r1', newRoutingMark: 'to-isp-1' });
    await client.createMangleRule({ action: 'mark-routing', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r2', newRoutingMark: 'to-isp-2' });

    await client.updateMangleRule({ ruleReference: 'r1' }, { newRoutingMark: 'to-isp-3' });

    expect(client.mangleRules[0]).to.include({ newRoutingMark: 'to-isp-3', ruleReference: 'r1' });
    expect(client.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('moves a rule before another rule', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r3' });
    const r1Id = client.mangleRules[0]!.id;

    await client.moveMangleRule({ ruleReference: 'r3' }, { placeBeforeId: r1Id });

    expect(client.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
  });

  it('removes a rule', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });

    await client.removeMangleRule({ ruleReference: 'r1' });

    expect(client.mangleRules).to.have.length(0);
  });

  it('lists rules in physical order', async () => {
    await client.createMangleRule({ action: 'mark-connection', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r1', newConnectionMark: 'm1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });

    const listed = await client.listMangleRules();
    expect(listed.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('no-ops enable/disable/remove/update/move when the rule does not exist', async () => {
    const missing = { ruleReference: 'missing' };
    await expect(client.disableMangleRule(missing)).resolves.toBeUndefined();
    await expect(client.enableMangleRule(missing)).resolves.toBeUndefined();
    await expect(client.removeMangleRule(missing)).resolves.toBeUndefined();
    await expect(client.updateMangleRule(missing, { protocol: 'tcp' })).resolves.toBeUndefined();
    await expect(client.moveMangleRule(missing, {})).resolves.toBeUndefined();
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(
      client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' }),
    ).rejects.toThrow('Client is closed');
    await expect(client.findMangleRule({ ruleReference: 'r1' })).rejects.toThrow('Client is closed');
  });
});
