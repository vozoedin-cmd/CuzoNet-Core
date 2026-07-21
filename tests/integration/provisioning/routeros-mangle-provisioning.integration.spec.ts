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
import { RouterOsMangleProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-mangle-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };

describe('RouterOS Mangle provisioning integration with the Provisioning Engine', () => {
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
        'routeros.firewall.mangle.add',
        new RouterOsMangleProvisioningAdapter(
          'routeros.firewall.mangle.add',
          resolver,
          secretProvider,
          clientFactory,
        ),
      ],
      [
        'routeros.firewall.mangle.remove',
        new RouterOsMangleProvisioningAdapter(
          'routeros.firewall.mangle.remove',
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
      actionType: 'routeros.firewall.mangle.add',
      idempotencyKey: 'mangle-mark-voip-conn',
      inputSnapshotJson: JSON.stringify({
        action: 'mark-connection',
        actionType: 'routeros.firewall.mangle.add',
        chain: 'prerouting',
        newConnectionMark: 'voip-conn',
        protocol: 'udp',
        routerId: 'router-1',
        ruleReference: 'mark-voip-conn',
      }),
      targetId: 'mark-voip-conn',
      targetType: 'mangle-rule',
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

    expect(fakeClient.mangleRules).to.have.length(1);
    expect(fakeClient.mangleRules[0]?.ruleReference).to.equal('mark-voip-conn');
    expect(fakeClient.mangleRules[0]?.newConnectionMark).to.equal('voip-conn');
  });

  it('provisions a dependent mark-packet rule that matches the connectionMark set by an earlier mark-connection rule', async () => {
    const markConnectionInput = {
      actionType: 'routeros.firewall.mangle.add',
      idempotencyKey: 'mangle-mark-connection',
      inputSnapshotJson: JSON.stringify({
        action: 'mark-connection',
        actionType: 'routeros.firewall.mangle.add',
        chain: 'prerouting',
        newConnectionMark: 'voip-conn',
        routerId: 'router-1',
        ruleReference: 'mark-voip-conn',
      }),
      targetId: 'mark-voip-conn',
      targetType: 'mangle-rule',
    };
    const markPacketInput = {
      actionType: 'routeros.firewall.mangle.add',
      idempotencyKey: 'mangle-mark-packet',
      inputSnapshotJson: JSON.stringify({
        action: 'mark-packet',
        actionType: 'routeros.firewall.mangle.add',
        chain: 'forward',
        connectionMark: 'voip-conn',
        newPacketMark: 'voip-packet',
        routerId: 'router-1',
        ruleReference: 'mark-voip-packet',
      }),
      targetId: 'mark-voip-packet',
      targetType: 'mangle-rule',
    };

    const first = await requestProvisioning.execute(markConnectionInput);
    const second = await requestProvisioning.execute(markPacketInput);
    await requestRepo.claimDue(10, 'worker-1', clock.now());
    await dispatch.execute({ requestId: first.id, workerId: 'worker-1' });
    await dispatch.execute({ requestId: second.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(first.id))?.status).to.equal('completed');
    expect((await requestRepo.findById(second.id))?.status).to.equal('completed');
    expect(fakeClient.mangleRules).to.have.length(2);
    expect(fakeClient.mangleRules[1]).to.include({ connectionMark: 'voip-conn', newPacketMark: 'voip-packet' });
  });

  it('identifies the rule by its Mangle comment marker across dispatches, surviving a .id change on the router', async () => {
    await fakeClient.createMangleRule({
      action: 'mark-connection',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-mangle:mark-voip-conn',
      newConnectionMark: 'voip-conn',
    });
    const originalId = fakeClient.mangleRules[0]!.id;

    // Simulate an export/restore cycle on the router: the resource keeps its
    // comment marker but is assigned a brand-new internal .id.
    fakeClient.mangleRules[0] = { ...fakeClient.mangleRules[0]!, id: '*999' };
    expect(fakeClient.mangleRules[0]?.id).not.to.equal(originalId);

    const input = {
      actionType: 'routeros.firewall.mangle.remove',
      idempotencyKey: 'mangle-remove-mark-voip-conn',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.firewall.mangle.remove',
        routerId: 'router-1',
        ruleReference: 'mark-voip-conn',
      }),
      targetId: 'mark-voip-conn',
      targetType: 'mangle-rule',
    };
    const request = await requestProvisioning.execute(input);
    await requestRepo.claimDue(10, 'worker-1', clock.now());
    await dispatch.execute({ requestId: request.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(request.id))?.status).to.equal('completed');
    expect(fakeClient.mangleRules).to.have.length(0);
  });
});
