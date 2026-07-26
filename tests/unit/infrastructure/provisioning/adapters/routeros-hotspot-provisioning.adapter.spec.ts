import { describe, it, expect, beforeEach } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsHotspotProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-hotspot-provisioning.adapter.js';
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

const secretsByReference: Record<string, string> = {
  SECRET: 'router-secret',
  'cred-newpass456': 'newpass456',
  'cred-oldpass': 'oldpass',
  'cred-pass123': 'pass123',
};

describe('RouterOsHotspotProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsHotspotProvisioningAdapter {
    return new RouterOsHotspotProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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
    secretProvider = { getSecret: async (reference) => secretsByReference[reference] ?? null };
    clientFactory = { create: async () => fakeClient };
  });

  describe('create', () => {
    it('creates a hotspot user and returns success', async () => {
      const adapter = adapterFor('routeros.hotspot.user.create');
      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-pass123',
          name: 'cliente-1',
          profile: 'default',
          routerId: 'router-1',
          sharedUsers: 2,
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers).to.have.length(1);
      expect(fakeClient.hotspotUsers[0]?.name).to.equal('cliente-1');
      expect(fakeClient.hotspotUsers[0]?.password).to.equal('pass123');
      expect(fakeClient.hotspotUsers[0]?.profile).to.equal('default');
      expect(fakeClient.hotspotUsers[0]?.sharedUsers).to.equal(2);
    });

    it('is idempotent when an identical user already exists', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.create');

      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-pass123',
          name: 'cliente-1',
          profile: 'default',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers).to.have.length(1);
    });

    it('returns a conflict when an existing user has different configuration', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'oldpass', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.create');

      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-oldpass',
          name: 'cliente-1',
          profile: 'other-profile',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_CONFLICT');
      }
    });

    it('returns a conflict (not idempotent success) when an existing user has the same profile but a different password', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.create');

      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-newpass456',
          name: 'cliente-1',
          profile: 'default',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_CONFLICT');
      }
      // Create nunca actualiza el password en silencio: el existente en RouterOS no cambia.
      expect(fakeClient.hotspotUsers).to.have.length(1);
      expect(fakeClient.hotspotUsers[0]?.password).to.equal('pass123');
    });

    it('never exposes either password (existing or requested) in the conflict result', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.create');

      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-newpass456',
          name: 'cliente-1',
          profile: 'default',
          routerId: 'router-1',
        }),
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.to.include('pass123');
      expect(serialized).not.to.include('newpass456');
    });

    it('fails permanently when the credential reference cannot be resolved', async () => {
      const adapter = adapterFor('routeros.hotspot.user.create');

      const result = await adapter.execute(
        input('routeros.hotspot.user.create', {
          credentialReference: 'cred-missing',
          name: 'cliente-1',
          profile: 'default',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_PASSWORD_SECRET_NOT_FOUND');
      }
      expect(fakeClient.hotspotUsers).to.have.length(0);
    });
  });

  describe('update', () => {
    it('updates only the changed fields and returns success', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.update');

      const result = await adapter.execute(
        input('routeros.hotspot.user.update', {
          profile: 'premium',
          routerId: 'router-1',
          userReference: 'cliente-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers[0]?.profile).to.equal('premium');
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.update');

      const result = await adapter.execute(
        input('routeros.hotspot.user.update', {
          profile: 'default',
          routerId: 'router-1',
          userReference: 'cliente-1',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the user does not exist', async () => {
      const adapter = adapterFor('routeros.hotspot.user.update');

      const result = await adapter.execute(
        input('routeros.hotspot.user.update', {
          profile: 'premium',
          routerId: 'router-1',
          userReference: 'missing-user',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_USER_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled user and returns success', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default', disabled: true });
      const adapter = adapterFor('routeros.hotspot.user.enable');

      const result = await adapter.execute(
        input('routeros.hotspot.user.enable', { routerId: 'router-1', userReference: 'cliente-1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers[0]?.disabled).to.equal(false);
    });

    it('is idempotent when the user is already enabled', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.enable');

      const result = await adapter.execute(
        input('routeros.hotspot.user.enable', { routerId: 'router-1', userReference: 'cliente-1' }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the user does not exist', async () => {
      const adapter = adapterFor('routeros.hotspot.user.enable');

      const result = await adapter.execute(
        input('routeros.hotspot.user.enable', { routerId: 'router-1', userReference: 'missing-user' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_USER_NOT_FOUND');
      }
    });
  });

  describe('disable', () => {
    it('disables an enabled user and returns success', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.disable');

      const result = await adapter.execute(
        input('routeros.hotspot.user.disable', { routerId: 'router-1', userReference: 'cliente-1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers[0]?.disabled).to.equal(true);
    });

    it('is idempotent when the user is already disabled', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default', disabled: true });
      const adapter = adapterFor('routeros.hotspot.user.disable');

      const result = await adapter.execute(
        input('routeros.hotspot.user.disable', { routerId: 'router-1', userReference: 'cliente-1' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  describe('remove', () => {
    it('removes an existing user and returns success', async () => {
      await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });
      const adapter = adapterFor('routeros.hotspot.user.remove');

      const result = await adapter.execute(
        input('routeros.hotspot.user.remove', { routerId: 'router-1', userReference: 'cliente-1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUsers).to.have.length(0);
    });

    it('is idempotent when the user is already gone', async () => {
      const adapter = adapterFor('routeros.hotspot.user.remove');

      const result = await adapter.execute(
        input('routeros.hotspot.user.remove', { routerId: 'router-1', userReference: 'missing-user' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.hotspot.user.create');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.hotspot.user.create',
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
    const adapter = adapterFor('routeros.hotspot.user.create');

    const result = await adapter.execute(
      input('routeros.hotspot.user.create', {
        credentialReference: 'cred-pass123',
        limitUptime: 'not-a-duration',
        name: 'cliente-1',
        profile: 'default',
        routerId: 'router-1',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });
});
