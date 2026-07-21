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
import { RouterOsHotspotProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-hotspot-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };

/**
 * Hito 14.5: ProvisioningRequest.create() rejects any inputSnapshotJson
 * containing a "password" key (see
 * domain/provisioning/provisioning-request.ts SENSITIVE_KEYS). Before this
 * hito, Hotspot/PPPoE "create"/"update" payloads carried the raw password
 * and were unconditionally rejected by the official RequestProvisioning
 * flow (they only "worked" by calling the adapter directly, bypassing the
 * engine). Passwords are now resolved via SecretProviderPort through a
 * `credentialReference`, so nothing sensitive ever reaches
 * inputSnapshotJson and the full official flow succeeds — this is what the
 * "create" scenario below proves.
 */
describe('RouterOS Hotspot provisioning integration with the Provisioning Engine', () => {
  let requestRepo: InMemoryProvisioningRequestRepository;
  let attemptRepo: InMemoryProvisioningAttemptRepository;
  let outbox: InMemoryOutbox<ProvisioningRequestDomainEvent>;
  let fakeClient: FakeRouterOsClient;
  let requestProvisioning: RequestProvisioning;
  let dispatch: DispatchProvisioningRequest;

  beforeEach(async () => {
    requestRepo = new InMemoryProvisioningRequestRepository();
    attemptRepo = new InMemoryProvisioningAttemptRepository();
    outbox = new InMemoryOutbox<ProvisioningRequestDomainEvent>();
    fakeClient = new FakeRouterOsClient();
    await fakeClient.createHotspotUser({ name: 'cliente-1', password: 'pass123', profile: 'default' });

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
    const secretProvider: SecretProviderPort = {
      getSecret: async (reference) =>
        ({ SECRET: 'router-secret', 'cred-cliente-2': 'nueva-clave-123' })[reference] ?? null,
    };
    // Mirrors SystemRouterOsClientFactory: a fresh connection per dispatch
    // (the base adapter closes the client after every execute), reusing the
    // same router-side state instead of a brand new FakeRouterOsClient.
    const clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const adapters = new Map<string, ProvisioningActionAdapter>([
      [
        'routeros.hotspot.user.remove',
        new RouterOsHotspotProvisioningAdapter(
          'routeros.hotspot.user.remove',
          resolver,
          secretProvider,
          clientFactory,
        ),
      ],
      [
        'routeros.hotspot.user.create',
        new RouterOsHotspotProvisioningAdapter(
          'routeros.hotspot.user.create',
          resolver,
          secretProvider,
          clientFactory,
        ),
      ],
    ]);

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

  it('submits and completes a "create" request through the official flow without ever persisting the password', async () => {
    const input = {
      actionType: 'routeros.hotspot.user.create',
      idempotencyKey: 'hotspot-user-cliente-2-create',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.hotspot.user.create',
        credentialReference: 'cred-cliente-2',
        name: 'cliente-2',
        profile: 'default',
        routerId: 'router-1',
      }),
      targetId: 'cliente-2',
      targetType: 'hotspot-user',
    };

    // ProvisioningRequest.create() no longer throws SensitiveDataInProvisioningError.
    const created = await requestProvisioning.execute(input);
    expect(created.inputSnapshotJson).not.to.include('nueva-clave-123');

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(created.id);

    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(created.id))?.status).to.equal('completed');

    const attempts = await attemptRepo.findByRequestId(created.id);
    expect(attempts[0]?.outcome).to.equal('succeeded');

    const provisionedUser = fakeClient.hotspotUsers.find((user) => user.name === 'cliente-2');
    expect(provisionedUser?.password).to.equal('nueva-clave-123'); // Router got the real secret via SecretProviderPort

    const eventTypes = outbox.events().map((event) => event.eventType);
    expect(eventTypes).to.deep.equal(['ProvisioningRequested.v1', 'ProvisioningSucceeded.v1']);
    for (const event of outbox.events()) {
      expect(event.payload.requestId).to.equal(created.id);
      expect(event.payload.routerId).to.equal('router-1');
      expect(event.payload.actionType).to.equal('routeros.hotspot.user.create');
      expect(event.payload.action).to.equal('create');
      expect(event.payload.resourceType).to.equal('routeros.hotspot.user');
      expect(JSON.stringify(event.payload)).not.to.include('nueva-clave-123'); // Never leaks the resolved secret
    }
  });

  it('submits idempotently, dispatches through the real adapter chain and completes successfully', async () => {
    const input = {
      actionType: 'routeros.hotspot.user.remove',
      idempotencyKey: 'hotspot-user-cliente-1-remove',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.hotspot.user.remove',
        routerId: 'router-1',
        userReference: 'cliente-1',
      }),
      targetId: 'cliente-1',
      targetType: 'hotspot-user',
    };

    const first = await requestProvisioning.execute(input);
    const repeated = await requestProvisioning.execute(input);
    expect(repeated).toEqual(first); // Idempotent request submission (same idempotencyKey)

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(first.id);

    await dispatch.execute({ requestId: first.id, workerId: 'worker-1' });

    const completed = await requestRepo.findById(first.id);
    expect(completed?.status).to.equal('completed');

    const attempts = await attemptRepo.findByRequestId(first.id);
    expect(attempts).to.have.length(1);
    expect(attempts[0]?.outcome).to.equal('succeeded');

    expect(fakeClient.hotspotUsers).to.have.length(0);
  });

  it('converges idempotently when two independent requests target the same RouterOS resource', async () => {
    const buildInput = (requestKey: string) => ({
      actionType: 'routeros.hotspot.user.remove',
      idempotencyKey: requestKey,
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.hotspot.user.remove',
        routerId: 'router-1',
        userReference: 'cliente-1',
      }),
      targetId: 'cliente-1',
      targetType: 'hotspot-user',
    });

    const requestA = await requestProvisioning.execute(buildInput('request-a'));
    const requestB = await requestProvisioning.execute(buildInput('request-b'));
    expect(requestA.id).not.to.equal(requestB.id); // Two distinct provisioning requests

    const claimed = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed.map((request) => request.id).sort()).toEqual([requestA.id, requestB.id].sort());

    for (const request of [requestA, requestB]) {
      await dispatch.execute({ requestId: request.id, workerId: 'worker-1' });
    }

    // First request actually removes the user; the second is a no-op success (already gone).
    expect(fakeClient.hotspotUsers).to.have.length(0);
    expect((await requestRepo.findById(requestA.id))?.status).to.equal('completed');
    expect((await requestRepo.findById(requestB.id))?.status).to.equal('completed');
  });
});
