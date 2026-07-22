import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../backend/application/ports/id-generator.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { GenerateReconciliationPlan } from '../../../backend/application/use-cases/synchronization/generate-reconciliation-plan.use-case.js';
import { RemoveDesiredResourceState } from '../../../backend/application/use-cases/synchronization/remove-desired-resource-state.use-case.js';
import { SetDesiredResourceState } from '../../../backend/application/use-cases/synchronization/set-desired-resource-state.use-case.js';
import { SqliteDesiredResourceStateRepository } from '../../../backend/infrastructure/database/synchronization/sqlite/sqlite-desired-resource-state.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { RouterOsActualStateReader } from '../../../backend/infrastructure/synchronization/routeros-actual-state.reader.js';
import { SqliteDesiredStateRepository } from '../../../backend/infrastructure/synchronization/sqlite-desired-state.repository.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
let idCounter = 0;
const idGenerator: IdGenerator = { generate: () => `state-${++idCounter}` };

describe('Declarative desired-state store driving the Synchronization Engine end-to-end', () => {
  let database: SqliteDatabase;
  let fakeClient: FakeRouterOsClient;
  let setState: SetDesiredResourceState;
  let removeState: RemoveDesiredResourceState;
  let generatePlan: GenerateReconciliationPlan;

  beforeEach(() => {
    idCounter = 0;
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    const desiredResourceStateRepo = new SqliteDesiredResourceStateRepository(database.session);
    setState = new SetDesiredResourceState(desiredResourceStateRepo, companyContext, clock, idGenerator);
    removeState = new RemoveDesiredResourceState(desiredResourceStateRepo, companyContext, clock);

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

    generatePlan = new GenerateReconciliationPlan(
      new SqliteDesiredStateRepository(desiredResourceStateRepo),
      new RouterOsActualStateReader(resolver, secretProvider, clientFactory),
      companyContext,
      clock,
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it('reports missing until the router catches up, then in_sync once it matches the declared state', async () => {
    await setState.execute({
      desiredFields: { action: 'drop', chain: 'input', protocol: 'tcp' },
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });

    const beforeProvisioning = await generatePlan.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });
    expect(beforeProvisioning.items).to.have.length(1);
    expect(beforeProvisioning.items[0]).to.include({ reference: 'block-ssh-wan', status: 'missing' });

    // Simulate the Provisioning Engine having applied it to the router.
    fakeClient.closed = false;
    await fakeClient.createFilterRule({
      action: 'drop',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:block-ssh-wan',
      protocol: 'tcp',
    });

    const afterProvisioning = await generatePlan.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });
    expect(afterProvisioning.items[0]).to.include({ reference: 'block-ssh-wan', status: 'in_sync' });
    expect(afterProvisioning.summary).to.deep.equal({ drifted: 0, inSync: 1, missing: 0, total: 1, unexpected: 0 });
  });

  it('reports drifted when the declared state is edited after the router already matched the old declaration', async () => {
    await setState.execute({
      desiredFields: { action: 'drop', chain: 'input', protocol: 'tcp' },
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });
    await fakeClient.createFilterRule({
      action: 'drop',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:block-ssh-wan',
      protocol: 'tcp',
    });

    // The operator re-declares the desired protocol; the router hasn't caught up yet.
    await setState.execute({
      desiredFields: { action: 'drop', chain: 'input', protocol: 'udp' },
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });

    const plan = await generatePlan.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });
    expect(plan.items[0]).to.include({ reference: 'block-ssh-wan', status: 'drifted' });
    expect(plan.items[0]?.differingFields).to.deep.equal(['protocol']);
  });

  it('reports unexpected once a declared resource is removed from the store but the router was never cleaned up', async () => {
    await setState.execute({
      desiredFields: { action: 'drop', chain: 'input' },
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
    });
    await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:block-ssh-wan' });

    await removeState.execute({ reference: 'block-ssh-wan', resourceType: 'filter-rule', routerId: 'router-1' });

    const plan = await generatePlan.execute({ resourceTypes: ['filter-rule'], routerId: 'router-1' });
    expect(plan.items[0]).to.include({ reference: 'block-ssh-wan', status: 'unexpected' });
  });
});
