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

    expect((await client.findNatRulesByReference('shared-ref'))[0]).to.include({ id: created.id });
    expect((await client.findNatRuleById(created.id))?.ownership.ruleReference).to.equal('shared-ref');
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

    await client.disableNatRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.natRules.map((r) => r.disabled)).to.deep.equal([true, false]);

    await client.enableNatRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.natRules[0]?.disabled).to.equal(false);
  });

  it('updates only the provided fields without changing position', async () => {
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r2' });

    await client.updateNatRule({ kind: 'managed-reference', ruleReference: 'r1' }, { toAddresses: '10.0.0.5' });

    expect(client.natRules[0]).to.include({ ruleReference: 'r1', toAddresses: '10.0.0.5' });
    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('moves a rule before another rule', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r3' });
    const r1Id = client.natRules[0]!.id;

    await client.moveNatRule({ kind: 'managed-reference', ruleReference: 'r3' }, { placeBeforeId: r1Id });

    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
  });

  it('moves a rule to the end when no placeBeforeId is given', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });

    await client.moveNatRule({ kind: 'managed-reference', ruleReference: 'r1' }, {});

    expect(client.natRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
  });

  it('removes a rule', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });

    await client.removeNatRule({ kind: 'managed-reference', ruleReference: 'r1' });

    expect(client.natRules).to.have.length(0);
  });

  it('lists rules in physical order', async () => {
    await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
    await client.createNatRule({ action: 'dst-nat', chain: 'dstnat', comment: 'cuzonet:firewall-nat:r2' });

    const listed = await client.listNatRules();
    expect(listed.map((r) => r.ownership.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('no-ops enable/disable/remove/update/move when the rule does not exist', async () => {
    const missing = { kind: 'managed-reference', ruleReference: 'missing' } as const;
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
    await expect(client.findNatRulesByReference('r1')).rejects.toThrow('Client is closed');
  });

  describe('observed shape', () => {
    const REFERENCE = 'port-8080';

    beforeEach(async () => {
      await client.createNatRule({
        action: 'dst-nat',
        chain: 'dstnat',
        comment: `cuzonet:firewall-nat:${REFERENCE} reenvio web`,
        dstPort: '8080',
        protocol: 'tcp',
        toAddresses: '192.168.1.50',
        toPorts: '80',
      });
    });

    it('exposes structured ownership instead of a flat ruleReference', async () => {
      const [observed] = await client.listNatRules();

      expect(observed?.ownership).to.deep.equal({
        ruleReference: REFERENCE,
        status: 'valid',
        userComment: 'reenvio web',
      });
      expect(observed).not.to.have.property('ruleReference');
    });

    it('reports the NAT-specific toAddresses and toPorts', async () => {
      const [observed] = await client.listNatRules();

      expect(observed).to.include({ toAddresses: '192.168.1.50', toPorts: '80' });
    });

    it('defaults the router-owned observation fields for a rule CuzoNet created', async () => {
      const [observed] = await client.listNatRules();

      expect(observed).to.include({ bytes: 0, disabled: false, dynamic: false, invalid: false, packets: 0 });
    });

    it('reports physicalIndex from a listing but omits it on a lookup by id', async () => {
      await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:second' });
      const listed = await client.listNatRules();
      expect(listed.map((r) => r.physicalIndex)).to.deep.equal([0, 1]);

      const byId = await client.findNatRuleById(listed[1]!.id);
      expect(byId).not.to.have.property('physicalIndex');
    });

    it('findNatRulesByReference returns every match, not just the first', async () => {
      await client.createNatRule({
        action: 'dst-nat',
        chain: 'dstnat',
        comment: `cuzonet:firewall-nat:${REFERENCE} duplicada`,
      });

      const matches = await client.findNatRulesByReference(REFERENCE);

      expect(matches).to.have.length(2);
      expect(matches.map((r) => r.physicalIndex)).to.deep.equal([0, 1]);
    });

    it('returns an empty array when no rule carries the reference', async () => {
      expect(await client.findNatRulesByReference('no-existe')).to.deep.equal([]);
    });

    it('classifies a rule CuzoNet never created as unmanaged, with no reference', async () => {
      await client.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'puesta a mano' });

      const [, foreign] = await client.listNatRules();

      expect(foreign?.ownership.status).to.equal('unmanaged');
      expect(foreign?.ownership.ruleReference).to.equal(undefined);
      expect(await client.findNatRulesByReference('puesta a mano')).to.deep.equal([]);
    });
  });
});
