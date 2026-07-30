import { describe, it, expect, beforeEach } from 'vitest';

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

let counter = 0;
function completedRequest(
  actionType: string,
  payload: Record<string, unknown>,
  completedAt: Date,
): ProvisioningRequest {
  counter += 1;
  const id = `req-${counter}`;
  const request = ProvisioningRequest.create({
    actionType,
    companyId: 'company-1',
    configurationReference: undefined,
    id,
    idempotencyKey: `key-${id}`,
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify(payload),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', completedAt);
  request.complete(completedAt);
  return request;
}

describe('GenerateReconciliationPlan (full engine, in-memory + fake RouterOS)', () => {
  let requestRepo: InMemoryProvisioningRequestRepository;
  let fakeClient: FakeRouterOsClient;
  let useCase: GenerateReconciliationPlan;

  beforeEach(() => {
    requestRepo = new InMemoryProvisioningRequestRepository();
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

    useCase = new GenerateReconciliationPlan(
      new ProvisioningHistoryDesiredStateRepository(requestRepo),
      new RouterOsActualStateReader(resolver, secretProvider, clientFactory),
      companyContext,
      clock,
    );
  });

  it('classifies in_sync, missing, drifted and unexpected across Filter Rules and NAT in one run', async () => {
    // in_sync: desired and actual agree.
    await requestRepo.save(
      completedRequest(
        'routeros.firewall.filter.add',
        { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'allow-lan' },
        new Date('2026-07-01T00:00:00.000Z'),
      ),
    );
    await fakeClient.createFilterRule({
      action: 'accept',
      chain: 'forward',
      comment: 'cuzonet:firewall-filter:allow-lan',
    });

    // missing: desired via history, never actually created on the router.
    await requestRepo.save(
      completedRequest(
        'routeros.firewall.filter.add',
        { action: 'drop', chain: 'input', routerId: 'router-1', ruleReference: 'block-telnet' },
        new Date('2026-07-01T00:00:00.000Z'),
      ),
    );

    // drifted: desired says tcp, router has udp.
    await requestRepo.save(
      completedRequest(
        'routeros.firewall.nat.add',
        {
          action: 'dst-nat',
          chain: 'dstnat',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'forward-web',
          toAddresses: '192.168.1.10',
        },
        new Date('2026-07-01T00:00:00.000Z'),
      ),
    );
    await fakeClient.createNatRule({
      action: 'dst-nat',
      chain: 'dstnat',
      comment: 'cuzonet:firewall-nat:forward-web',
      protocol: 'udp',
      toAddresses: '192.168.1.10',
    });

    // unexpected: present on the router, never provisioned by CuzoNet.
    await fakeClient.createFilterRule({
      action: 'reject',
      chain: 'output',
      comment: 'manually added by an operator during an incident',
    });

    const plan = await useCase.execute({
      resourceTypes: ['filter-rule', 'nat-rule'],
      routerId: 'router-1',
    });

    const byReference = new Map(plan.items.map((item) => [item.reference, item]));
    expect(byReference.get('allow-lan')?.status).to.equal('in_sync');
    expect(byReference.get('block-telnet')?.status).to.equal('missing');
    expect(byReference.get('forward-web')).to.include({ status: 'drifted' });
    expect(byReference.get('forward-web')?.differingFields).to.deep.equal(['protocol']);
    const unexpected = plan.items.find((item) => item.status === 'unexpected');
    expect(unexpected?.reference).to.match(/^unmanaged:/);

    expect(plan.summary).to.deep.equal({
      ambiguous: 0,
      drifted: 1,
      inSync: 1,
      isConverged: false,
      missing: 1,
      total: 4,
      unexpected: 1,
    });
    expect(plan.mode).to.equal('dry-run');
    expect(plan.routerId).to.equal('router-1');
  });

  it('reflects a remove recorded after the add as the resource no longer being desired', async () => {
    await requestRepo.save(
      completedRequest(
        'routeros.firewall.address-list.add',
        { address: '192.168.1.10', list: 'blocked-ips', routerId: 'router-1' },
        new Date('2026-07-01T00:00:00.000Z'),
      ),
    );
    await requestRepo.save(
      completedRequest(
        'routeros.firewall.address-list.remove',
        { address: '192.168.1.10', list: 'blocked-ips', routerId: 'router-1' },
        new Date('2026-07-02T00:00:00.000Z'),
      ),
    );
    // The router was never actually cleaned up (e.g. the dispatch is still pending) — should surface as unexpected.
    await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });

    const plan = await useCase.execute({
      resourceTypes: ['address-list-entry'],
      routerId: 'router-1',
    });

    expect(plan.items).to.have.length(1);
    expect(plan.items[0]).to.include({
      reference: 'blocked-ips:192.168.1.10',
      status: 'unexpected',
    });
  });

  /**
   * Una entrada dinámica la gobierna RouterOS y desaparece sola, así que CuzoNet no puede
   * haberla deseado nunca. Reportarla como `unexpected` inventaría una divergencia y
   * contradiría al aprovisionamiento, que ya se niega a operar sobre ellas.
   */
  it('never reports a dynamic address-list entry as unexpected', async () => {
    fakeClient.addressListEntries.push({
      address: '192.168.1.198',
      disabled: false,
      dynamic: true,
      id: '*10',
      list: 'blocked-ips',
    });

    const plan = await useCase.execute({
      resourceTypes: ['address-list-entry'],
      routerId: 'router-1',
    });

    expect(plan.items).to.deep.equal([]);
    expect(plan.summary.unexpected).to.equal(0);
  });

  /**
   * Contrapunto: una entrada estática que CuzoNet nunca provisionó SÍ debe reportarse.
   * `unexpected` significa "CuzoNet no es su dueño", nunca "hay que borrarla" — el router
   * de laboratorio conserva siete entradas de 2023 que nadie referencia.
   */
  it('still reports a static entry CuzoNet never provisioned, without proposing any action', async () => {
    await fakeClient.createAddressListEntry({
      address: '192.168.10.255',
      comment: 'X/31/2023 19:28 Router Cesar',
      list: 'MOROSOS',
    });

    const plan = await useCase.execute({
      resourceTypes: ['address-list-entry'],
      routerId: 'router-1',
    });

    expect(plan.items).to.have.length(1);
    expect(plan.items[0]).to.include({ reference: 'MOROSOS:192.168.10.255', status: 'unexpected' });
    expect(plan.items[0]?.desiredFields).to.equal(undefined);
    expect(plan.mode).to.equal('dry-run');
  });

  it('produces an empty, fully in-sync-free plan when nothing was ever provisioned or found', async () => {
    const plan = await useCase.execute({ routerId: 'router-1' });

    expect(plan.items).to.deep.equal([]);
    expect(plan.summary).to.deep.equal({
      ambiguous: 0,
      drifted: 0,
      inSync: 0,
      isConverged: true,
      missing: 0,
      total: 0,
      unexpected: 0,
    });
  });
});
