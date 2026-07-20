import { describe, it, expect, beforeEach } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-simple-queue-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('RouterOsSimpleQueueProvisioningAdapter', () => {
  let clientFactory: RouterOsClientFactoryPort;
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let adapter: RouterOsSimpleQueueProvisioningAdapter;

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
      getSecret: async () => 'secret',
    };
    clientFactory = {
      create: async () => fakeClient,
    };
    adapter = new RouterOsSimpleQueueProvisioningAdapter(
      'routeros.simple_queue.create',
      resolver,
      secretProvider,
      clientFactory,
    );
  });

  it('should create a simple queue and return success outcome', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        maxLimitDownload: '10M',
        maxLimitUpload: '5M',
        queueName: 'cliente-1',
        routerId: 'router-1',
        target: '192.168.1.10',
      }),
      targetId: 'target-1',
      targetType: 'RouterOS',
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.queues.length).to.equal(1);
    expect(fakeClient.queues[0]?.name).to.equal('cliente-1');
    expect(fakeClient.queues[0]?.maxLimit).to.equal('5M/10M');
  });

  it('should reject invalid json payload', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      targetId: 'target-1',
      targetType: 'RouterOS',
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('permanentFailure');
    expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
  });
});
