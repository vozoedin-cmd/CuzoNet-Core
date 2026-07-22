import { describe, it, expect, beforeEach, vi } from 'vitest';

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

  describe('routeros.pppoe.update', () => {
    let updateAdapter: RouterOsPppoeProvisioningAdapter;

    beforeEach(() => {
      updateAdapter = new RouterOsPppoeProvisioningAdapter(
        'routeros.pppoe.update',
        resolver,
        secretProvider,
        clientFactory,
      );
    });

    function updateInput(payload: Record<string, unknown>, requestId: string): ProvisioningActionInput {
      return {
        actionType: 'routeros.pppoe.update',
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: requestId,
        inputSnapshotJson: JSON.stringify({
          actionType: 'routeros.pppoe.update',
          routerId: 'router-lab',
          ...payload,
        }),
        requestId,
        target: { id: 'TEST-PPPOE-001', type: 'pppoe-secret' },
      };
    }

    it('returns ROUTEROS_PPPOE_NOT_FOUND when the reference does not exist, and never calls updatePppoeSecret', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updatePppoeSecret');

      const result = await updateAdapter.execute(
        updateInput({ comment: 'no importa', pppoeReference: 'TEST-PPPOE-001' }, 'req-update-not-found'),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_PPPOE_NOT_FOUND');
      }
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('is idempotent (no /ppp/secret/set) when the desired state already matches', async () => {
      fakeClient.secrets.push({
        comment: 'Prueba E2E PPPoE 001',
        disabled: false,
        id: '*A1',
        name: 'TEST-PPPOE-001',
        password: 'pass',
        profile: 'perfil-residencial',
        service: 'pppoe',
      });
      const updateSpy = vi.spyOn(fakeClient, 'updatePppoeSecret');

      const result = await updateAdapter.execute(
        updateInput(
          {
            comment: 'Prueba E2E PPPoE 001',
            credentialReference: 'cred-pass',
            pppoeReference: 'TEST-PPPOE-001',
            profile: 'perfil-residencial',
          },
          'req-update-noop',
        ),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('calls updatePppoeSecret with { name: ... } only, and with only the fields that actually differ', async () => {
      fakeClient.secrets.push({
        comment: 'Comentario viejo',
        disabled: false,
        id: '*A1',
        name: 'TEST-PPPOE-001',
        password: 'pass',
        profile: 'perfil-residencial',
        service: 'pppoe',
      });
      const updateSpy = vi.spyOn(fakeClient, 'updatePppoeSecret');

      const result = await updateAdapter.execute(
        updateInput({ comment: 'Comentario nuevo', pppoeReference: 'TEST-PPPOE-001' }, 'req-update-real-change'),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith({ name: 'TEST-PPPOE-001' }, { comment: 'Comentario nuevo' });
      expect(fakeClient.secrets[0]?.comment).to.equal('Comentario nuevo');
    });

    it('looks up the secret by name only, never by id', async () => {
      fakeClient.secrets.push({
        comment: 'Comentario',
        disabled: false,
        id: '*A1',
        name: 'TEST-PPPOE-001',
        password: 'pass',
        profile: 'perfil-residencial',
        service: 'pppoe',
      });
      const findSpy = vi.spyOn(fakeClient, 'findPppoeSecret');

      await updateAdapter.execute(
        updateInput({ comment: 'Comentario nuevo', pppoeReference: 'TEST-PPPOE-001' }, 'req-update-lookup'),
      );

      expect(findSpy).toHaveBeenCalledWith({ name: 'TEST-PPPOE-001' });
    });
  });

  describe('routeros.pppoe.enable / disable / remove', () => {
    beforeEach(() => {
      fakeClient.secrets.push({
        comment: 'Comentario',
        disabled: false,
        id: '*A1',
        name: 'TEST-PPPOE-001',
        password: 'pass',
        profile: 'perfil-residencial',
        service: 'pppoe',
      });
    });

    function actionInput(actionType: string, requestId: string): ProvisioningActionInput {
      return {
        actionType,
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: requestId,
        inputSnapshotJson: JSON.stringify({
          actionType,
          pppoeReference: 'TEST-PPPOE-001',
          routerId: 'router-lab',
        }),
        requestId,
        target: { id: 'TEST-PPPOE-001', type: 'pppoe-secret' },
      };
    }

    it('enable finds the secret by name only, never by id', async () => {
      const enableAdapter = new RouterOsPppoeProvisioningAdapter(
        'routeros.pppoe.enable',
        resolver,
        secretProvider,
        clientFactory,
      );
      const enableSpy = vi.spyOn(fakeClient, 'enablePppoeSecret');

      const result = await enableAdapter.execute(actionInput('routeros.pppoe.enable', 'req-enable'));

      expect(result.outcome).to.equal('success');
      expect(enableSpy).toHaveBeenCalledWith({ name: 'TEST-PPPOE-001' });
      expect(fakeClient.secrets[0]?.disabled).to.equal(false);
    });

    it('disable finds the secret by name only, never by id', async () => {
      const disableAdapter = new RouterOsPppoeProvisioningAdapter(
        'routeros.pppoe.disable',
        resolver,
        secretProvider,
        clientFactory,
      );
      const disableSpy = vi.spyOn(fakeClient, 'disablePppoeSecret');

      const result = await disableAdapter.execute(actionInput('routeros.pppoe.disable', 'req-disable'));

      expect(result.outcome).to.equal('success');
      expect(disableSpy).toHaveBeenCalledWith({ name: 'TEST-PPPOE-001' });
      expect(fakeClient.secrets[0]?.disabled).to.equal(true);
    });

    it('remove finds the secret by name only, never by id', async () => {
      const removeAdapter = new RouterOsPppoeProvisioningAdapter(
        'routeros.pppoe.remove',
        resolver,
        secretProvider,
        clientFactory,
      );
      const removeSpy = vi.spyOn(fakeClient, 'removePppoeSecret');

      const result = await removeAdapter.execute(actionInput('routeros.pppoe.remove', 'req-remove'));

      expect(result.outcome).to.equal('success');
      expect(removeSpy).toHaveBeenCalledWith({ name: 'TEST-PPPOE-001' });
      expect(fakeClient.secrets).to.have.length(0);
    });
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
