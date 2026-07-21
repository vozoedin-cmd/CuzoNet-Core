import { describe, it, expect, beforeEach } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsMangleProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-mangle-provisioning.adapter.js';
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

describe('RouterOsMangleProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsMangleProvisioningAdapter {
    return new RouterOsMangleProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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
    it('creates a mark-connection rule carrying the Mangle comment marker and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          comment: 'Marca VoIP',
          newConnectionMark: 'voip-conn',
          protocol: 'udp',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.comment).to.equal('cuzonet:firewall-mangle:mark-voip-conn Marca VoIP');
      expect(fakeClient.mangleRules[0]?.newConnectionMark).to.equal('voip-conn');
    });

    it('creates a dependent mark-packet rule matching on an existing connectionMark', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet',
          chain: 'forward',
          connectionMark: 'voip-conn',
          newPacketMark: 'voip-packet',
          routerId: 'router-1',
          ruleReference: 'mark-voip-packet',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(2);
      expect(fakeClient.mangleRules[1]).to.include({ connectionMark: 'voip-conn', newPacketMark: 'voip-packet' });
    });

    it('rejects mark-connection without newConnectionMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it('rejects mark-packet without newPacketMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('rejects mark-routing without newRoutingMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-routing',
          chain: 'prerouting',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('accepts passthrough without any mark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'passthrough',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'noop-rule',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('places the new rule at the requested position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'passthrough',
          chain: 'forward',
          position: 1,
          routerId: 'router-1',
          ruleReference: 'r0',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    it('is idempotent when an equivalent rule already exists', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'other-mark',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_CONFLICT');
      }
    });
  });

  describe('update', () => {
    it('updates only the changed fields and preserves the marker', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-routing',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:route-isp-2',
        newRoutingMark: 'to-isp-2',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newRoutingMark: 'to-isp-3',
          routerId: 'router-1',
          ruleReference: 'route-isp-2',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.newRoutingMark).to.equal('to-isp-3');
    });

    it('rejects switching action to mark-packet without providing newPacketMark', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          action: 'mark-packet',
          routerId: 'router-1',
          ruleReference: 'noop-rule',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'missing',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('move', () => {
    it('moves a rule to the requested position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r3' });
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'r3' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
        disabled: true,
      });
      const adapter = adapterFor('routeros.firewall.mangle.enable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.enable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.disabled).to.equal(false);
    });
  });

  describe('disable', () => {
    it('disables an enabled rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.disable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.disabled).to.equal(true);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.disable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes an existing rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.remove');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.remove');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.mangle.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.mangle.add',
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
    const adapter = adapterFor('routeros.firewall.mangle.add');

    const result = await adapter.execute(
      input('routeros.firewall.mangle.add', {
        action: 'jump',
        chain: 'forward',
        routerId: 'router-1',
        ruleReference: 'bad-rule',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });
});
