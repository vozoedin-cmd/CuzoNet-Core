import { describe, it, expect, beforeEach } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { ProvisioningActionAdapter } from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { ProvisioningRetryPolicy } from '../../../backend/domain/provisioning/services/provisioning-retry-policy.js';
import type { ProvisioningRequestDomainEvent } from '../../../backend/domain/provisioning/events/provisioning-request-domain-event.js';
import { InMemoryProvisioningAttemptRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-attempt.repository.js';
import { InMemoryProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { InMemoryOutbox } from '../../../backend/infrastructure/events/in-memory-outbox.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { RouterOsHotspotUserProfileProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-hotspot-user-profile-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-30T12:00:00.000Z') };

/**
 * Hotspot User Profile a través del flujo oficial del Provisioning Engine
 * (RequestProvisioning -> claimDue -> DispatchProvisioningRequest), con los mismos
 * actionTypes que quedan registrados en server.ts.
 */
describe('RouterOS Hotspot User Profile provisioning integration with the Provisioning Engine', () => {
  let requestRepo: InMemoryProvisioningRequestRepository;
  let attemptRepo: InMemoryProvisioningAttemptRepository;
  let outbox: InMemoryOutbox<ProvisioningRequestDomainEvent>;
  let fakeClient: FakeRouterOsClient;
  let requestProvisioning: RequestProvisioning;
  let dispatch: DispatchProvisioningRequest;

  beforeEach(() => {
    requestRepo = new InMemoryProvisioningRequestRepository();
    attemptRepo = new InMemoryProvisioningAttemptRepository();
    outbox = new InMemoryOutbox<ProvisioningRequestDomainEvent>();
    fakeClient = new FakeRouterOsClient();

    const resolver: RouterConnectionResolverPort = {
      resolve: async () => ({
        host: '10.0.0.1',
        port: 8728,
        secretReference: 'SECRET',
        timeoutMs: 1000,
        tls: false,
        username: 'admin',
      }),
    };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'router-secret' };
    // Refleja SystemRouterOsClientFactory: conexión nueva por dispatch reutilizando el
    // estado del router (el adapter base cierra el cliente tras cada execute).
    const clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const adapters = new Map<string, ProvisioningActionAdapter>(
      (['create', 'update', 'remove'] as const).map((op) => {
        const actionType = `routeros.hotspot.user_profile.${op}`;
        return [
          actionType,
          new RouterOsHotspotUserProfileProvisioningAdapter(
            actionType,
            resolver,
            secretProvider,
            clientFactory,
          ),
        ];
      }),
    );

    requestProvisioning = new RequestProvisioning(
      requestRepo,
      companyContext,
      new UuidV7IdGenerator(),
      outbox,
      clock,
      3,
    );
    dispatch = new DispatchProvisioningRequest(
      requestRepo,
      attemptRepo,
      adapters,
      new UuidV7IdGenerator(),
      clock,
      new ProvisioningRetryPolicy(3),
      outbox,
    );
  });

  async function submitAndDispatch(
    actionType: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    const created = await requestProvisioning.execute({
      actionType,
      idempotencyKey,
      inputSnapshotJson: JSON.stringify({ actionType, routerId: 'router-1', ...payload }),
      targetId: 'PERFIL-E2E',
      targetType: 'hotspot-user-profile',
    });

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(created.id);

    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });
    return created.id;
  }

  it('creates a profile through the official flow and emits the expected events', async () => {
    const id = await submitAndDispatch('routeros.hotspot.user_profile.create', 'hs-profile-create-1', {
      name: 'PERFIL-E2E',
      rateLimit: '5M/10M',
      sessionTimeout: '1h',
      sharedUsers: 'unlimited',
    });

    expect((await requestRepo.findById(id))?.status).to.equal('completed');
    expect((await attemptRepo.findByRequestId(id))[0]?.outcome).to.equal('succeeded');

    const created = fakeClient.hotspotUserProfiles.find((p) => p.name === 'PERFIL-E2E');
    expect(created?.rateLimit).to.equal('5M/10M');
    expect(created?.sessionTimeout).to.equal('1h');
    expect(created?.sharedUsers).to.equal('unlimited');

    expect(outbox.events().map((e) => e.eventType)).to.deep.equal([
      'ProvisioningRequested.v1',
      'ProvisioningSucceeded.v1',
    ]);
  });

  it('updates a profile through the official flow', async () => {
    await submitAndDispatch('routeros.hotspot.user_profile.create', 'hs-profile-create-2', {
      name: 'PERFIL-E2E',
      sessionTimeout: '1h',
    });

    const id = await submitAndDispatch('routeros.hotspot.user_profile.update', 'hs-profile-update-1', {
      profileReference: 'PERFIL-E2E',
      rateLimit: '2M/4M',
    });

    expect((await requestRepo.findById(id))?.status).to.equal('completed');
    const updated = fakeClient.hotspotUserProfiles.find((p) => p.name === 'PERFIL-E2E');
    expect(updated?.rateLimit).to.equal('2M/4M');
    expect(updated?.sessionTimeout).to.equal('1h');
  });

  it('removes a profile through the official flow', async () => {
    await submitAndDispatch('routeros.hotspot.user_profile.create', 'hs-profile-create-3', {
      name: 'PERFIL-E2E',
    });

    const id = await submitAndDispatch('routeros.hotspot.user_profile.remove', 'hs-profile-remove-1', {
      profileReference: 'PERFIL-E2E',
    });

    expect((await requestRepo.findById(id))?.status).to.equal('completed');
    expect(fakeClient.hotspotUserProfiles).to.have.length(0);
  });

  it('fails the request with NOT_FOUND when updating a profile that does not exist', async () => {
    const id = await submitAndDispatch('routeros.hotspot.user_profile.update', 'hs-profile-update-2', {
      profileReference: 'NO-EXISTE',
      rateLimit: '2M/4M',
    });

    const request = await requestRepo.findById(id);
    expect(request?.status).to.equal('failed');
    expect(request?.lastErrorCode).to.equal('ROUTEROS_HOTSPOT_USER_PROFILE_NOT_FOUND');
    expect(outbox.events().map((e) => e.eventType)).to.include('ProvisioningFailed.v1');
  });

  it('fails the request with PROTECTED when removing the RouterOS default profile', async () => {
    fakeClient.hotspotUserProfiles.push({ id: '*1', isDefault: true, name: 'default' });

    const id = await submitAndDispatch('routeros.hotspot.user_profile.remove', 'hs-profile-remove-2', {
      profileReference: 'default',
    });

    const request = await requestRepo.findById(id);
    expect(request?.status).to.equal('failed');
    expect(request?.lastErrorCode).to.equal('ROUTEROS_HOTSPOT_USER_PROFILE_PROTECTED');
    expect(fakeClient.hotspotUserProfiles).to.have.length(1);
  });

  it('accepts a payload that carries no secrets at all (nothing to redact in the snapshot)', async () => {
    const created = await requestProvisioning.execute({
      actionType: 'routeros.hotspot.user_profile.create',
      idempotencyKey: 'hs-profile-create-4',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.hotspot.user_profile.create',
        name: 'PERFIL-E2E',
        routerId: 'router-1',
        sharedUsers: 'unlimited',
      }),
      targetId: 'PERFIL-E2E',
      targetType: 'hotspot-user-profile',
    });

    // El contrato excluye onLogin/onLogout justamente para que ningún script con
    // credenciales embebidas llegue a persistirse aquí.
    expect(created.inputSnapshotJson).not.to.include('onLogin');
    expect(created.inputSnapshotJson).not.to.include('onLogout');
  });
});
