import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient NAT rules', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('creates a rule, parsing its ruleReference from the NAT comment marker', async () => {
    await client.createNatRule({
      action: 'masquerade',
      chain: 'srcnat',
      comment: 'cuzonet:firewall-nat:wan-masquerade Salida a Internet',
    });

    expect(client.natRules).to.have.length(1);
    expect(client.natRules[0]).to.include({
      action: 'masquerade',
      chain: 'srcnat',
      disabled: false,
      ruleReference: 'wan-masquerade',
    });
    expect(client.natRules[0]?.id).to.match(/^\*\d+$/);
  });

  it('stores toAddresses and toPorts', async () => {
    await client.createNatRule({
      action: 'dst-nat',
      chain: 'dstnat',
      comment: 'cuzonet:firewall-nat:forward-web',
      dstPort: '8080',
      toAddresses: '192.168.1.10',
      toPorts: '80',
    });

    expect(client.natRules[0]).to.include({ toAddresses: '192.168.1.10', toPorts: '80' });
  });

  it('finds a rule by ruleReference and by id, keeping it separate from filter rules', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:shared-ref' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:shared-ref' });
    const created = client.natRules[0]!;

    expect(await client.findNatRule({ ruleReference: 'shared-ref' })).to.include({ id: created.id });
    expect(await client.findNatRule({ id: created.id })).to.include({ ruleReference: 'shared-ref' });
    expect(client.filterRules).to.have.length(1);
    expect(client.natRules).to.have.length(1);
  });

  it('appends new rules at the end by default and inserts before a given placeBeforeId', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
    const r1Id = client.natRules[0]!.id;

    await client.createNatRule({
      action: 'masquerade',
      chain: 'srcnat',
      comment: 'cuzonet:firewall-nat:r0',
      placeBeforeId: r1Id,
    });

    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r0', 'r1', 'r2']);
  });

  it('enables and disables a rule in place, preserving order', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });

    await client.disableNatRule({ ruleReference: 'r1' });
    expect(client.natRules.map((r) => r.disabled)).to.deep.equal([true, false]);

    await client.enableNatRule({ ruleReference: 'r1' });
    expect(client.natRules[0]?.disabled).to.equal(false);
  });

  it('updates only the provided fields without changing position', async () => {
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r2' });

    await client.updateNatRule({ ruleReference: 'r1' }, { toAddresses: '10.0.0.5' });

    expect(client.natRules[0]).to.include({ ruleReference: 'r1', toAddresses: '10.0.0.5' });
    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('moves a rule before another rule', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r3' });
    const r1Id = client.natRules[0]!.id;

    await client.moveNatRule({ ruleReference: 'r3' }, { placeBeforeId: r1Id });

    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
  });

  it('moves a rule to the end when no placeBeforeId is given', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });

    await client.moveNatRule({ ruleReference: 'r1' }, {});

    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
  });

  it('removes a rule', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });

    await client.removeNatRule({ ruleReference: 'r1' });

    expect(client.natRules).to.have.length(0);
  });

  it('lists rules in physical order', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r2' });

    const listed = await client.listNatRules();
    expect(listed.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('no-ops enable/disable/remove/update/move when the rule does not exist', async () => {
    const missing = { ruleReference: 'missing' };
    await expect(client.disableNatRule(missing)).resolves.toBeUndefined();
    await expect(client.enableNatRule(missing)).resolves.toBeUndefined();
    await expect(client.removeNatRule(missing)).resolves.toBeUndefined();
    await expect(client.updateNatRule(missing, { protocol: 'tcp' })).resolves.toBeUndefined();
    await expect(client.moveNatRule(missing, {})).resolves.toBeUndefined();
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(
      client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' }),
    ).rejects.toThrow('Client is closed');
    await expect(client.findNatRule({ ruleReference: 'r1' })).rejects.toThrow('Client is closed');
  });
});
