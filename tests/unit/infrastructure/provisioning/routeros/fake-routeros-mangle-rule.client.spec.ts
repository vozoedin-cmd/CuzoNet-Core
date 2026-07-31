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

    expect((await client.findMangleRulesByReference('shared-ref'))[0]).to.include({ id: created.id });
    expect((await client.findMangleRuleById(created.id))?.ownership.ruleReference).to.equal('shared-ref');
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

    await client.disableMangleRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.mangleRules.map((r) => r.disabled)).to.deep.equal([true, false]);

    await client.enableMangleRule({ kind: 'managed-reference', ruleReference: 'r1' });
    expect(client.mangleRules[0]?.disabled).to.equal(false);
  });

  it('updates only the provided fields without changing position', async () => {
    await client.createMangleRule({ action: 'mark-routing', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r1', newRoutingMark: 'to-isp-1' });
    await client.createMangleRule({ action: 'mark-routing', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r2', newRoutingMark: 'to-isp-2' });

    await client.updateMangleRule({ kind: 'managed-reference', ruleReference: 'r1' }, { newRoutingMark: 'to-isp-3' });

    expect(client.mangleRules[0]).to.include({ newRoutingMark: 'to-isp-3', ruleReference: 'r1' });
    expect(client.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('moves a rule before another rule', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r3' });
    const r1Id = client.mangleRules[0]!.id;

    await client.moveMangleRule({ kind: 'managed-reference', ruleReference: 'r3' }, { placeBeforeId: r1Id });

    expect(client.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
  });

  it('removes a rule', async () => {
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });

    await client.removeMangleRule({ kind: 'managed-reference', ruleReference: 'r1' });

    expect(client.mangleRules).to.have.length(0);
  });

  it('lists rules in physical order', async () => {
    await client.createMangleRule({ action: 'mark-connection', chain: 'prerouting', comment: 'cuzonet:firewall-mangle:r1', newConnectionMark: 'm1' });
    await client.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });

    const listed = await client.listMangleRules();
    expect(listed.map((r) => r.ownership.ruleReference)).to.deep.equal(['r1', 'r2']);
  });

  it('no-ops enable/disable/remove/update/move when the rule does not exist', async () => {
    const missing = { kind: 'managed-reference', ruleReference: 'missing' } as const;
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
    await expect(client.findMangleRulesByReference('r1')).rejects.toThrow('Client is closed');
  });

  /**
   * Forma observada. El doble debe exponer exactamente lo que expone el cliente real; la
   * suite de contract tests de la Fase 3 lo verificara lado a lado.
   */
  describe('observed shape', () => {
    const REFERENCE = 'marca-voip';

    beforeEach(async () => {
      await client.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: `cuzonet:firewall-mangle:${REFERENCE} prioridad`,
        newConnectionMark: 'voip-conn',
        protocol: 'udp',
      });
    });

    it('exposes structured ownership instead of a flat ruleReference', async () => {
      const [observed] = await client.listMangleRules();

      expect(observed?.ownership).to.deep.equal({
        ruleReference: REFERENCE,
        status: 'valid',
        userComment: 'prioridad',
      });
      expect(observed).not.to.have.property('ruleReference');
    });

    it('materialises passthrough with the observed router default when omitted', async () => {
      const [observed] = await client.listMangleRules();

      expect(observed?.passthrough).to.equal(true);
    });

    it('preserves an explicit passthrough=false on create', async () => {
      await client.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:sin-passthrough',
        newPacketMark: 'bulk',
        passthrough: false,
      });

      const [, observed] = await client.listMangleRules();

      expect(observed?.passthrough).to.equal(false);
    });

    it('preserves an explicit passthrough=false on update', async () => {
      await client.updateMangleRule(
        { kind: 'managed-reference', ruleReference: REFERENCE },
        { passthrough: false },
      );

      expect((await client.listMangleRules())[0]?.passthrough).to.equal(false);
    });

    it('leaves passthrough untouched when the update does not mention it', async () => {
      await client.updateMangleRule(
        { kind: 'managed-reference', ruleReference: REFERENCE },
        { protocol: 'tcp' },
      );

      const [observed] = await client.listMangleRules();
      expect(observed?.passthrough).to.equal(true);
      expect(observed?.protocol).to.equal('tcp');
    });

    it('defaults the router-owned observation fields for a rule CuzoNet created', async () => {
      const [observed] = await client.listMangleRules();

      expect(observed).to.include({ bytes: 0, disabled: false, dynamic: false, invalid: false, packets: 0 });
    });

    it('omits optional fields the rule does not carry', async () => {
      const [observed] = await client.listMangleRules();

      for (const absent of ['srcAddress', 'dstAddress', 'srcPort', 'dstPort', 'inInterface',
        'outInterface', 'connectionState', 'connectionMark', 'packetMark', 'routingMark',
        'newPacketMark', 'newRoutingMark']) {
        expect(observed, absent).not.to.have.property(absent);
      }
      expect(observed?.newConnectionMark).to.equal('voip-conn');
    });

    it('keeps an empty-string optional instead of dropping it as falsy', async () => {
      await client.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:vacio',
        newPacketMark: 'x',
        srcAddress: '',
      });

      const [, observed] = await client.listMangleRules();
      expect(observed).to.have.property('srcAddress', '');
    });

    it('omits comment entirely when the rule has none', async () => {
      client.mangleRules.push({
        action: 'mark-packet', bytes: 0, chain: 'forward', disabled: false, dynamic: false,
        id: '*99', invalid: false, packets: 0, passthrough: true,
      });

      const observed = await client.findMangleRuleById('*99');

      expect(observed).not.to.have.property('comment');
      expect(observed?.ownership.status).to.equal('unmanaged');
    });

    it('reports physicalIndex from a listing but omits it on a lookup by id', async () => {
      await client.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: 'cuzonet:firewall-mangle:second',
        newPacketMark: 'p',
      });
      const listed = await client.listMangleRules();
      expect(listed.map((r) => r.physicalIndex)).to.deep.equal([0, 1]);

      expect(await client.findMangleRuleById(listed[1]!.id)).not.to.have.property('physicalIndex');
    });
  });

  describe('lookups by reference (0 / 1 / N)', () => {
    const REFERENCE = 'duplicada';

    it('returns an empty array when nothing matches', async () => {
      expect(await client.findMangleRulesByReference('no-existe')).to.deep.equal([]);
    });

    it('returns the single match', async () => {
      await client.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: `cuzonet:firewall-mangle:${REFERENCE}`,
        newPacketMark: 'p',
      });

      expect(await client.findMangleRulesByReference(REFERENCE)).to.have.length(1);
    });

    it('returns every match, not just the first', async () => {
      for (const mark of ['p1', 'p2']) {
        await client.createMangleRule({
          action: 'mark-packet', chain: 'forward', comment: `cuzonet:firewall-mangle:${REFERENCE}`,
          newPacketMark: mark,
        });
      }

      const matches = await client.findMangleRulesByReference(REFERENCE);

      expect(matches).to.have.length(2);
      expect(matches.map((r) => r.physicalIndex)).to.deep.equal([0, 1]);
    });

    it('a rule CuzoNet never created is unmanaged and unresolvable', async () => {
      await client.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: 'puesta a mano', newPacketMark: 'p',
      });

      const [observed] = await client.listMangleRules();
      expect(observed?.ownership.status).to.equal('unmanaged');
      expect(observed?.ownership.ruleReference).to.equal(undefined);
      expect(await client.findMangleRulesByReference('puesta a mano')).to.deep.equal([]);
    });
  });

  describe('discriminated locators', () => {
    const REFERENCE = 'locator';

    beforeEach(async () => {
      await client.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: `cuzonet:firewall-mangle:${REFERENCE}`,
        newPacketMark: 'p',
      });
    });

    it('mutates by id', async () => {
      const id = client.mangleRules[0]!.id;

      await client.disableMangleRule({ id, kind: 'id' });

      expect(client.mangleRules[0]?.disabled).to.equal(true);
    });

    it('mutates by managed reference', async () => {
      await client.disableMangleRule({ kind: 'managed-reference', ruleReference: REFERENCE });

      expect(client.mangleRules[0]?.disabled).to.equal(true);
    });

    it('an id locator does not fall back to the reference', async () => {
      await client.removeMangleRule({ id: '*no-existe', kind: 'id' });

      expect(client.mangleRules).to.have.length(1);
    });
  });
});
