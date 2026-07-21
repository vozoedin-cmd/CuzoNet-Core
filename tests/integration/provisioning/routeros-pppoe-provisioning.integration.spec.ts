import { describe, it, expect, beforeEach } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { ProvisioningActionAdapter } from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { ProvisioningRetryPolicy } from '../../../backend/domain/provisioning/services/provisioning-retry-policy.js';
import { InMemoryProvisioningAttemptRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-attempt.repository.js';
import { InMemoryProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { RouterOsPppoeProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-pppoe-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };

/**
 * Hito 14.5: before this hito, PPPoE was broken through the official
 * RequestProvisioning flow for every single action:
 *   - "create"/"update" embedded a raw "password" key, rejected by
 *     ProvisioningRequest.create()'s SENSITIVE_KEYS guard.
 *   - "update"/"enable"/"disable"/"remove" used a "secretReference" key,
 *     which ALSO tripped the same guard purely by naming coincidence
 *     ('secretreference'.includes('secret')), even though it only ever
 *     held a non-sensitive identifier, never a credential.
 * Both are fixed here: passwords now flow through SecretProviderPort via
 * `credentialReference`, and the identifier field was renamed to
 * `pppoeReference` to stop colliding with the guard.
 */
describe('RouterOS PPPoE provisioning integration with the Provisioning Engine', () => {
  let requestRepo: InMemoryProvisioningRequestRepository;
  let attemptRepo: InMemoryProvisioningAttemptRepository;
  let fakeClient: FakeRouterOsClient;
  let requestProvisioning: RequestProvisioning;
  let dispatch: DispatchProvisioningRequest;

  beforeEach(() => {
    requestRepo = new InMemoryProvisioningRequestRepository();
    attemptRepo = new InMemoryProvisioningAttemptRepository();
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
    const secretProvider: SecretProviderPort = {
      getSecret: async (reference) =>
        ({ SECRET: 'router-secret', 'cred-cliente-3': 'clave-inicial-123' })[reference] ?? null,
    };
    const clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const adapters = new Map<string, ProvisioningActionAdapter>([
      [
        'routeros.pppoe.create',
        new RouterOsPppoeProvisioningAdapter('routeros.pppoe.create', resolver, secretProvider, clientFactory),
      ],
      [
        'routeros.pppoe.disable',
        new RouterOsPppoeProvisioningAdapter('routeros.pppoe.disable', resolver, secretProvider, clientFactory),
      ],
    ]);

    requestProvisioning = new RequestProvisioning(requestRepo, companyContext, new UuidV7IdGenerator(), 3);
    dispatch = new DispatchProvisioningRequest(
      requestRepo,
      attemptRepo,
      adapters,
      new UuidV7IdGenerator(),
      clock,
      new ProvisioningRetryPolicy(3),
    );
  });

  it('creates a PPPoE secret through the official flow without ever persisting the password', async () => {
    const input = {
      actionType: 'routeros.pppoe.create',
      idempotencyKey: 'pppoe-user-cliente-3-create',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-cliente-3',
        name: 'cliente-3',
        profile: 'perfil-1',
        routerId: 'router-1',
      }),
      targetId: 'cliente-3',
      targetType: 'pppoe-secret',
    };

    // ProvisioningRequest.create() no longer throws SensitiveDataInProvisioningError.
    const created = await requestProvisioning.execute(input);
    expect(created.inputSnapshotJson).not.to.include('clave-inicial-123');

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(created.id);

    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(created.id))?.status).to.equal('completed');
    expect(fakeClient.secrets[0]?.password).to.equal('clave-inicial-123');
  });

  it('disables an existing PPPoE secret through the official flow using pppoeReference', async () => {
    await fakeClient.createPppoeSecret({ name: 'cliente-3', password: 'clave-inicial-123', profile: 'perfil-1' });

    const input = {
      actionType: 'routeros.pppoe.disable',
      idempotencyKey: 'pppoe-user-cliente-3-disable',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.disable',
        pppoeReference: 'cliente-3',
        routerId: 'router-1',
      }),
      targetId: 'cliente-3',
      targetType: 'pppoe-secret',
    };

    // Previously rejected too: "pppoeReference" used to be "secretReference",
    // which collided with the same SENSITIVE_KEYS guard as the password did.
    const created = await requestProvisioning.execute(input);

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(created.id);

    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(created.id))?.status).to.equal('completed');
    expect(fakeClient.secrets[0]?.disabled).to.equal(true);
  });
});
