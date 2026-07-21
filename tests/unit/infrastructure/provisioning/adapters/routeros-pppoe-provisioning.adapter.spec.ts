import { describe, it, expect, beforeEach } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsPppoeProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-pppoe-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

const secretsByReference: Record<string, string> = {
  SECRET: 'router-secret',
  'cred-newpass': 'newpass',
  'cred-oldpass': 'oldpass',
  'cred-pass': 'pass',
  'cred-plaintext-check': 'S3cr3tPlaintextValue!',
};

describe('RouterOsPppoeProvisioningAdapter', () => {
  let clientFactory: RouterOsClientFactoryPort;
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let adapter: RouterOsPppoeProvisioningAdapter;

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
    secretProvider = {
      getSecret: async (reference) => secretsByReference[reference] ?? null,
    };
    clientFactory = {
      create: async () => fakeClient,
    };
    adapter = new RouterOsPppoeProvisioningAdapter(
      'routeros.pppoe.create',
      resolver,
      secretProvider,
      clientFactory,
    );
  });

  it('should create a PPPoE secret and return success outcome', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-pass',
        name: 'cliente-1',
        profile: 'prof1',
        routerId: 'router-1',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.secrets.length).to.equal(1);
    expect(fakeClient.secrets[0]?.name).to.equal('cliente-1');
    expect(fakeClient.secrets[0]?.password).to.equal('pass');
    expect(fakeClient.secrets[0]?.profile).to.equal('prof1');
  });

  it('never persists the resolved password inside the request payload', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-plaintext-check',
        name: 'cliente-1',
        profile: 'prof1',
        routerId: 'router-1',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.secrets[0]?.password).to.equal('S3cr3tPlaintextValue!'); // Router received the real secret
    expect(input.inputSnapshotJson).not.to.include('S3cr3tPlaintextValue'); // ...but it was never in the persisted payload
    expect(input.inputSnapshotJson).to.include('cred-plaintext-check'); // only the opaque reference was submitted
  });

  it('should be idempotent if secret matches', async () => {
    await fakeClient.createPppoeSecret({
      name: 'cliente-1',
      password: 'pass',
      profile: 'prof1',
    });

    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-pass',
        name: 'cliente-1',
        profile: 'prof1',
        routerId: 'router-1',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);
    expect(result.outcome).to.equal('success');
    expect(fakeClient.secrets.length).to.equal(1); // Didn't duplicate
  });

  it('should return conflict if secret exists with different config', async () => {
    await fakeClient.createPppoeSecret({
      name: 'cliente-1',
      password: 'oldpass',
      profile: 'prof1',
    });

    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-newpass',
        name: 'cliente-1',
        profile: 'prof1',
        routerId: 'router-1',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);
    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_PPPOE_CONFLICT');
    }
  });

  it('fails permanently when the credential reference cannot be resolved', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-missing',
        name: 'cliente-1',
        profile: 'prof1',
        routerId: 'router-1',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_PASSWORD_SECRET_NOT_FOUND');
    }
    expect(fakeClient.secrets).to.have.length(0);
  });

  it('should reject invalid json payload', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-2',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });
});
