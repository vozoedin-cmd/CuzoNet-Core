import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsHotspotUserProfileProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-hotspot-user-profile-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

function input(actionType: string, payload: Record<string, unknown>, requestId = 'req-1'): ProvisioningActionInput {
  return {
    actionType,
    companyId: 'company-1',
    configurationReference: undefined,
    idempotencyKey: requestId,
    inputSnapshotJson: JSON.stringify({ actionType, routerId: 'router-lab', ...payload }),
    requestId,
    target: { id: 'PERFIL-1', type: 'hotspot-user-profile' },
  };
}

describe('RouterOsHotspotUserProfileProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  const adapterFor = (actionType: string) =>
    new RouterOsHotspotUserProfileProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);

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

  describe('create', () => {
    it('creates a profile and returns success', async () => {
      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', {
          name: 'PERFIL-1',
          rateLimit: '5M/10M',
          sessionTimeout: '1h',
          sharedUsers: 'unlimited',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUserProfiles).to.have.length(1);
      expect(fakeClient.hotspotUserProfiles[0]?.name).to.equal('PERFIL-1');
      expect(fakeClient.hotspotUserProfiles[0]?.rateLimit).to.equal('5M/10M');
      expect(fakeClient.hotspotUserProfiles[0]?.sharedUsers).to.equal('unlimited');
    });

    it('is idempotent when an identical profile already exists', async () => {
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1', sessionTimeout: '1h' });

      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', { name: 'PERFIL-1', sessionTimeout: '1h' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUserProfiles).to.have.length(1);
    });

    it('is idempotent when omitted fields match the RouterOS defaults', async () => {
      // Creado sin especificar nada mas: el router aplica sus defaults.
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1' });
      const createSpy = vi.spyOn(fakeClient, 'createHotspotUserProfile');

      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', { name: 'PERFIL-1' }),
      );

      // Comparar los campos omitidos contra `undefined` habria producido un conflicto falso.
      expect(result.outcome).to.equal('success');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns a conflict when an existing profile differs', async () => {
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1', sharedUsers: '5' });

      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', { name: 'PERFIL-1', sharedUsers: 'unlimited' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_USER_PROFILE_CONFLICT');
      }
      expect(fakeClient.hotspotUserProfiles[0]?.sharedUsers).to.equal('5');
    });

    it('treats addressPool="none" as equivalent to no pool at all', async () => {
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1' });

      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', { addressPool: 'none', name: 'PERFIL-1' }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('rejects a payload combining addMacCookie=false with macCookieTimeout', async () => {
      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', {
          addMacCookie: false,
          macCookieTimeout: '3d',
          name: 'PERFIL-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
      expect(fakeClient.hotspotUserProfiles).to.have.length(0);
    });

    it('rejects onLogin in the payload', async () => {
      const result = await adapterFor('routeros.hotspot.user_profile.create').execute(
        input('routeros.hotspot.user_profile.create', { name: 'PERFIL-1', onLogin: ':log info "x"' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1', sessionTimeout: '1h' });
    });

    it('updates only the changed fields', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateHotspotUserProfile');

      const result = await adapterFor('routeros.hotspot.user_profile.update').execute(
        input('routeros.hotspot.user_profile.update', {
          profileReference: 'PERFIL-1',
          rateLimit: '2M/4M',
          sessionTimeout: '1h',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).toHaveBeenCalledWith({ name: 'PERFIL-1' }, { rateLimit: '2M/4M' });
      expect(fakeClient.hotspotUserProfiles[0]?.rateLimit).to.equal('2M/4M');
    });

    it('is idempotent (no /set) when nothing actually changes', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateHotspotUserProfile');

      const result = await adapterFor('routeros.hotspot.user_profile.update').execute(
        input('routeros.hotspot.user_profile.update', {
          profileReference: 'PERFIL-1',
          sessionTimeout: '1h',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('looks the profile up by name only, never by id', async () => {
      const findSpy = vi.spyOn(fakeClient, 'findHotspotUserProfile');

      await adapterFor('routeros.hotspot.user_profile.update').execute(
        input('routeros.hotspot.user_profile.update', { profileReference: 'PERFIL-1', rateLimit: '2M/4M' }),
      );

      expect(findSpy).toHaveBeenCalledWith({ name: 'PERFIL-1' });
    });

    it('fails with NOT_FOUND when the profile does not exist', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateHotspotUserProfile');

      const result = await adapterFor('routeros.hotspot.user_profile.update').execute(
        input('routeros.hotspot.user_profile.update', { profileReference: 'NO-EXISTE', rateLimit: '2M/4M' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_USER_PROFILE_NOT_FOUND');
      }
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes an existing profile', async () => {
      await fakeClient.createHotspotUserProfile({ name: 'PERFIL-1' });

      const result = await adapterFor('routeros.hotspot.user_profile.remove').execute(
        input('routeros.hotspot.user_profile.remove', { profileReference: 'PERFIL-1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.hotspotUserProfiles).to.have.length(0);
    });

    it('is idempotent when the profile is already gone', async () => {
      const result = await adapterFor('routeros.hotspot.user_profile.remove').execute(
        input('routeros.hotspot.user_profile.remove', { profileReference: 'NO-EXISTE' }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('refuses to remove the RouterOS default profile, without calling the router', async () => {
      // El flag `default` solo lo pone RouterOS; se simula un perfil protegido.
      fakeClient.hotspotUserProfiles.push({
        id: '*1',
        isDefault: true,
        name: 'default',
      });
      const removeSpy = vi.spyOn(fakeClient, 'removeHotspotUserProfile');

      const result = await adapterFor('routeros.hotspot.user_profile.remove').execute(
        input('routeros.hotspot.user_profile.remove', { profileReference: 'default' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_HOTSPOT_USER_PROFILE_PROTECTED');
      }
      expect(removeSpy).not.toHaveBeenCalled();
      expect(fakeClient.hotspotUserProfiles).to.have.length(1);
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const result = await adapterFor('routeros.hotspot.user_profile.create').execute({
      actionType: 'routeros.hotspot.user_profile.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-bad',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-bad',
      target: { id: 'PERFIL-1', type: 'hotspot-user-profile' },
    });

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });
});
