import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { SynchronizationController } from '../../../backend/api/synchronization/controller/synchronization.controller.js';
import { createSynchronizationRouter } from '../../../backend/api/synchronization/routes/synchronization.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { GenerateReconciliationPlan } from '../../../backend/application/use-cases/synchronization/generate-reconciliation-plan.use-case.js';
import { ProvisioningRequest } from '../../../backend/domain/provisioning/provisioning-request.js';
import { InMemoryProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { ProvisioningHistoryDesiredStateRepository } from '../../../backend/infrastructure/synchronization/provisioning-history-desired-state.repository.js';
import { RouterOsActualStateReader } from '../../../backend/infrastructure/synchronization/routeros-actual-state.reader.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };

function seededRequest(): ProvisioningRequest {
  const request = ProvisioningRequest.create({
    actionType: 'routeros.firewall.filter.add',
    companyId: 'company-1',
    configurationReference: undefined,
    id: 'req-1',
    idempotencyKey: 'key-1',
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify({
      action: 'accept',
      chain: 'forward',
      routerId: 'router-1',
      ruleReference: 'allow-lan',
    }),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', new Date('2026-07-01T00:00:00.000Z'));
  request.complete(new Date('2026-07-01T00:00:00.000Z'));
  return request;
}

describe('Synchronization API integration', () => {
  let app: ReturnType<typeof createApp>;
  let fakeClient: FakeRouterOsClient;

  beforeEach(async () => {
    const requestRepo = new InMemoryProvisioningRequestRepository();
    await requestRepo.save(seededRequest());
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
    const clientFactory: RouterOsClientFactoryPort = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };

    const useCase = new GenerateReconciliationPlan(
      new ProvisioningHistoryDesiredStateRepository(requestRepo),
      new RouterOsActualStateReader(resolver, secretProvider, clientFactory),
      companyContext,
      clock,
    );
    const controller = new SynchronizationController(useCase);
    app = createApp({ synchronizationRouter: createSynchronizationRouter(controller) });
  });

  it('returns a dry-run reconciliation plan for the requested router', async () => {
    await fakeClient.createFilterRule({
      action: 'accept',
      chain: 'forward',
      comment: 'cuzonet:firewall-filter:allow-lan',
    });

    const response = await request(app)
      .get('/api/v1/synchronization/routers/router-1/reconciliation-plan')
      .expect(200);

    expect(response.body).toMatchObject({
      companyId: 'company-1',
      generatedAt: '2026-07-21T12:00:00.000Z',
      mode: 'dry-run',
      routerId: 'router-1',
    });
    expect(response.body.items).to.have.length(1);
    expect(response.body.items[0]).to.include({ reference: 'allow-lan', status: 'in_sync' });
  });

  it('filters by the resourceTypes query param', async () => {
    const response = await request(app)
      .get('/api/v1/synchronization/routers/router-1/reconciliation-plan?resourceTypes=nat-rule')
      .expect(200);

    expect(response.body.items).to.deep.equal([]);
    expect(response.body.summary).to.deep.equal({
      ambiguous: 0,
      drifted: 0,
      inSync: 0,
      isConverged: true,
      missing: 0,
      total: 0,
      unexpected: 0,
    });
  });

  it('rejects an invalid resourceTypes value with 400', async () => {
    const response = await request(app)
      .get(
        '/api/v1/synchronization/routers/router-1/reconciliation-plan?resourceTypes=not-a-resource',
      )
      .expect(400);

    expect(response.body.error).to.match(/resourceTypes inválido/);
  });
});
