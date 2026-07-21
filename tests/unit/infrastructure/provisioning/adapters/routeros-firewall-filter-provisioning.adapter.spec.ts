import { describe, it, expect, beforeEach } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsFirewallFilterProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-firewall-filter-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

function input(actionType: string, payload: Record<string, unknown>, requestId = 'req-1'): ProvisioningActionInput {
  return {
    actionType,
    attemptNumber: 1,
    companyId: 'company-1',
    configurationReference: undefined,
    idempotencyKey: 'key-1',
    inputSnapshotJson: JSON.stringify({ actionType, ...payload }),
    requestId,
    target: { id: 'target-1', type: 'RouterOS' },
  };
}

describe('RouterOsFirewallFilterProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsFirewallFilterProvisioningAdapter {
    return new RouterOsFirewallFilterProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
  }

  beforeEach(() => {
    fakeClient = new FakeRouterOsClient();
    resolver = {
      resolve: async () => ({
        host: '10.0.0.1',
        port: 8728,
        secretReference: 'SECRET',
        timeoutMs: 1000,
        tls: false,
        username: 'admin',
      }),
    };
    secretProvider = { getSecret: async () => 'router-secret' };
    clientFactory = { create: async () => fakeClient };
  });

  describe('add', () => {
    it('creates a filter rule carrying the comment marker and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          comment: 'Bloquea SSH desde WAN',
          dstPort: '22',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
          srcAddress: '203.0.113.0/24',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(1);
      expect(fakeClient.filterRules[0]?.comment).to.equal(
        'cuzonet:firewall-filter:block-ssh-wan Bloquea SSH desde WAN',
      );
      expect(fakeClient.filterRules[0]?.action).to.equal('drop');
      expect(fakeClient.filterRules[0]?.protocol).to.equal('tcp');
      expect(fakeClient.filterRules[0]?.dstPort).to.equal('22');
    });

    it('reports the ruleReference in the success metadata', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'allow-lan',
        }),
      );

      expect(result.outcome).to.equal('success');
      if (result.outcome === 'success') {
        expect(result.metadata?.ruleReference).to.equal('allow-lan');
      }
    });

    it('places the new rule at the requested position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          position: 1,
          routerId: 'router-1',
          ruleReference: 'r0',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    it('is idempotent when an equivalent rule already exists', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        protocol: 'tcp',
      });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'reject',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_CONFLICT');
      }
    });
  });

  describe('update', () => {
    it('updates only the changed fields and preserves the marker', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.protocol).to.equal('tcp');
      expect(fakeClient.filterRules[0]?.action).to.equal('drop');
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        protocol: 'tcp',
      });
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          action: 'drop',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'missing',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('move', () => {
    it('moves a rule to the requested position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r3' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'r3' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
    });

    it('moves a rule to the end when position is beyond the last index', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 99, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        disabled: true,
      });
      const adapter = adapterFor('routeros.firewall.filter.enable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.enable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.disabled).to.equal(false);
    });

    it('is idempotent when already enabled', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.enable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.enable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  describe('disable', () => {
    it('disables an enabled rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.disable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.disabled).to.equal(true);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.disable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes an existing rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.remove');

      const result = await adapter.execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.filter.remove');

      const result = await adapter.execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.filter.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.filter.add',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-2',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(badInput);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });

  it('rejects a payload that fails schema validation', async () => {
    const adapter = adapterFor('routeros.firewall.filter.add');

    const result = await adapter.execute(
      input('routeros.firewall.filter.add', {
        action: 'accept',
        chain: 'not-a-chain',
        routerId: 'router-1',
        ruleReference: 'allow-lan',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });
});
