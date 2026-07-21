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
import { RouterOsFirewallAddressListProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-firewall-address-list-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };

describe('RouterOS Firewall Address List provisioning integration with the Provisioning Engine', () => {
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
    const secretProvider: SecretProviderPort = { getSecret: async () => 'router-secret' };
    const clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const adapters = new Map<string, ProvisioningActionAdapter>([
      [
        'routeros.firewall.address-list.add',
        new RouterOsFirewallAddressListProvisioningAdapter(
          'routeros.firewall.address-list.add',
          resolver,
          secretProvider,
          clientFactory,
        ),
      ],
      [
        'routeros.firewall.address-list.remove',
        new RouterOsFirewallAddressListProvisioningAdapter(
          'routeros.firewall.address-list.remove',
          resolver,
          secretProvider,
          clientFactory,
        ),
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

  it('submits idempotently, dispatches through the real adapter chain and completes successfully', async () => {
    const input = {
      actionType: 'routeros.firewall.address-list.add',
      idempotencyKey: 'address-list-blocked-ips-192.168.1.10',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.firewall.address-list.add',
        address: '192.168.1.10',
        list: 'blocked-ips',
        routerId: 'router-1',
      }),
      targetId: '192.168.1.10',
      targetType: 'address-list-entry',
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

    expect(fakeClient.addressListEntries).to.have.length(1);
    expect(fakeClient.addressListEntries[0]?.address).to.equal('192.168.1.10');
    expect(fakeClient.addressListEntries[0]?.list).to.equal('blocked-ips');
  });

  it('converges idempotently when two independent requests target the same RouterOS resource', async () => {
    await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    const buildInput = (requestKey: string) => ({
      actionType: 'routeros.firewall.address-list.remove',
      idempotencyKey: requestKey,
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.firewall.address-list.remove',
        address: '192.168.1.10',
        list: 'blocked-ips',
        routerId: 'router-1',
      }),
      targetId: '192.168.1.10',
      targetType: 'address-list-entry',
    });

    const requestA = await requestProvisioning.execute(buildInput('request-a'));
    const requestB = await requestProvisioning.execute(buildInput('request-b'));
    expect(requestA.id).not.to.equal(requestB.id); // Two distinct provisioning requests

    const claimed = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed.map((request) => request.id).sort()).toEqual([requestA.id, requestB.id].sort());

    for (const request of [requestA, requestB]) {
      await dispatch.execute({ requestId: request.id, workerId: 'worker-1' });
    }

    // First request actually removes the entry; the second is a no-op success (already gone).
    expect(fakeClient.addressListEntries).to.have.length(0);
    expect((await requestRepo.findById(requestA.id))?.status).to.equal('completed');
    expect((await requestRepo.findById(requestB.id))?.status).to.equal('completed');
  });
});
