import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient filter rules', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('creates a rule, parsing its ruleReference from the comment marker', async () => {
    await client.createFilterRule({
      action: 'drop',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:block-ssh-wan Bloquea SSH',
    });

    expect(client.filterRules).to.have.length(1);
    expect(client.filterRules[0]).to.include({
      action: 'drop',
      chain: 'input',
      disabled: false,
      ruleReference: 'block-ssh-wan',
    });
    expect(client.filterRules[0]?.id).to.match(/^\*\d+$/);
  });

  it('finds a rule by ruleReference and by id', async () => {
    await client.createFilterRule({
      action: 'accept',
      chain: 'forward',
      comment: 'cuzonet:firewall-filter:allow-lan',
    });
    const created = client.filterRules[0]!;

    expect((await client.findFilterRulesByReference('allow-lan'))[0]).to.include({ id: created.id });
    const byId = await client.findFilterRuleById(created.id);
    expect(byId).not.toBeNull();
    expect(byId!.ownership).to.include({ status: 'valid', ruleReference: 'allow-lan' });
    const missing = (await client.findFilterRulesByReference('missing'))[0];
    expect(missing).toBeUndefined();
  });

  it('appends new rules at the end by default', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r3' });

    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2', 'r3']);
  });

  it('inserts a new rule before the given placeBeforeId', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
    const r1Id = client.filterRules[0]!.id;

    await client.createFilterRule({
      action: 'accept',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:r0',
      placeBeforeId: r1Id,
    });

    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r0', 'r1', 'r2']);
  });

  it('enables and disables a rule in place, preserving order', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });

    await client.disableFilterRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.filterRules.map((r) => r.disabled)).to.deep.equal([true, false]);
    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);

    await client.enableFilterRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.filterRules[0]?.disabled).to.equal(false);
  });

  it('updates only the provided fields without changing position', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });

    await client.updateFilterRule({ kind: 'managed-reference', ruleReference: 'r1' }, { protocol: 'tcp' });

    expect(client.filterRules[0]).to.include({ protocol: 'tcp', ruleReference: 'r1' });
    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('moves a rule before another rule', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r3' });
    const r1Id = client.filterRules[0]!.id;

    await client.moveFilterRule({ kind: 'managed-reference', ruleReference: 'r3' }, { placeBeforeId: r1Id });

    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
  });

  it('moves a rule to the end when no placeBeforeId is given', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });

    await client.moveFilterRule({ kind: 'managed-reference', ruleReference: 'r1' }, {});

    expect(client.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
  });

  it('removes a rule', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });

    await client.removeFilterRule({ kind: 'managed-reference', ruleReference: 'r1' });

    expect(client.filterRules).to.have.length(0);
  });

  it('lists rules in physical order', async () => {
    await client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await client.createFilterRule({ action: 'accept', chain: 'forward', comment: 'cuzonet:firewall-filter:r2' });

    const listed = await client.listFilterRules();
    expect(listed.map((r) => r.ownership.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('no-ops enable/disable/remove/update/move when the rule does not exist', async () => {
    const missing = { kind: 'managed-reference' as const, ruleReference: 'missing' };
    await expect(client.disableFilterRule(missing)).resolves.toBeUndefined();
    await expect(client.enableFilterRule(missing)).resolves.toBeUndefined();
    await expect(client.removeFilterRule(missing)).resolves.toBeUndefined();
    await expect(client.updateFilterRule(missing, { protocol: 'tcp' })).resolves.toBeUndefined();
    await expect(client.moveFilterRule(missing, {})).resolves.toBeUndefined();
  });

  it('throws once the client is closed', async () => {
    await client.close();

    await expect(
      client.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' }),
    ).rejects.toThrow('Client is closed');
    await expect(client.findFilterRulesByReference('r1')).rejects.toThrow('Client is closed');
  });
});
