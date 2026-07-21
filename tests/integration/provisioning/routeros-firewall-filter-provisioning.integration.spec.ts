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
import { RouterOsFirewallFilterProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-firewall-filter-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };

describe('RouterOS Firewall Filter provisioning integration with the Provisioning Engine', () => {
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
    const clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const adapters = new Map<string, ProvisioningActionAdapter>([
      [
        'routeros.firewall.filter.add',
        new RouterOsFirewallFilterProvisioningAdapter('routeros.firewall.filter.add', resolver, secretProvider, clientFactory),
      ],
      [
        'routeros.firewall.filter.move',
        new RouterOsFirewallFilterProvisioningAdapter(
          'routeros.firewall.filter.move',
          resolver,
          secretProvider,
          clientFactory,
        ),
      ],
      [
        'routeros.firewall.filter.remove',
        new RouterOsFirewallFilterProvisioningAdapter(
          'routeros.firewall.filter.remove',
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

  it('submits idempotently, dispatches through the real adapter chain and completes successfully', async () => {
    const input = {
      actionType: 'routeros.firewall.filter.add',
      idempotencyKey: 'filter-block-ssh-wan',
      inputSnapshotJson: JSON.stringify({
        action: 'drop',
        actionType: 'routeros.firewall.filter.add',
        chain: 'input',
        dstPort: '22',
        protocol: 'tcp',
        routerId: 'router-1',
        ruleReference: 'block-ssh-wan',
      }),
      targetId: 'block-ssh-wan',
      targetType: 'filter-rule',
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

    expect(fakeClient.filterRules).to.have.length(1);
    expect(fakeClient.filterRules[0]?.ruleReference).to.equal('block-ssh-wan');
    expect(fakeClient.filterRules[0]?.comment).to.equal('cuzonet:firewall-filter:block-ssh-wan');
  });

  it('identifies the rule by its comment marker across dispatches, surviving a .id change on the router', async () => {
    await fakeClient.createFilterRule({
      action: 'drop',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:block-ssh-wan',
    });
    const originalId = fakeClient.filterRules[0]!.id;

    // Simulate an export/restore cycle on the router: the resource keeps its
    // comment marker but is assigned a brand-new internal .id.
    fakeClient.filterRules[0] = { ...fakeClient.filterRules[0]!, id: '*999' };
    expect(fakeClient.filterRules[0]?.id).not.to.equal(originalId);

    const input = {
      actionType: 'routeros.firewall.filter.remove',
      idempotencyKey: 'filter-remove-block-ssh-wan',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.firewall.filter.remove',
        routerId: 'router-1',
        ruleReference: 'block-ssh-wan',
      }),
      targetId: 'block-ssh-wan',
      targetType: 'filter-rule',
    };
    const request = await requestProvisioning.execute(input);
    await requestRepo.claimDue(10, 'worker-1', clock.now());
    await dispatch.execute({ requestId: request.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(request.id))?.status).to.equal('completed');
    expect(fakeClient.filterRules).to.have.length(0);
  });

  it('converges idempotently when two independent requests move the same rule to the same position', async () => {
    await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
    await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });

    const buildInput = (requestKey: string) => ({
      actionType: 'routeros.firewall.filter.move',
      idempotencyKey: requestKey,
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.firewall.filter.move',
        position: 0,
        routerId: 'router-1',
        ruleReference: 'r2',
      }),
      targetId: 'r2',
      targetType: 'filter-rule',
    });

    const requestA = await requestProvisioning.execute(buildInput('request-a'));
    const requestB = await requestProvisioning.execute(buildInput('request-b'));
    expect(requestA.id).not.to.equal(requestB.id);

    await requestRepo.claimDue(10, 'worker-1', clock.now());
    for (const request of [requestA, requestB]) {
      await dispatch.execute({ requestId: request.id, workerId: 'worker-1' });
    }

    expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
    expect((await requestRepo.findById(requestA.id))?.status).to.equal('completed');
    expect((await requestRepo.findById(requestB.id))?.status).to.equal('completed');
  });
});
