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
import { RouterOsRawProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-raw-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
const TARGET_TYPE = 'Firewall Raw Rule';

describe('RouterOS Raw provisioning integration with the Provisioning Engine', () => {
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

    const adapters = new Map<string, ProvisioningActionAdapter>(
      ['add', 'update', 'move', 'enable', 'disable', 'remove'].map((operation) => {
        const actionType = `routeros.firewall.raw.${operation}`;
        return [
          actionType,
          new RouterOsRawProvisioningAdapter(actionType, resolver, secretProvider, clientFactory),
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

  function submission(
    operation: string,
    ruleReference: string,
    payload: Record<string, unknown>,
    idempotencyKey = `raw-${operation}-${ruleReference}`,
  ): Parameters<RequestProvisioning['execute']>[0] {
    const actionType = `routeros.firewall.raw.${operation}`;
    return {
      actionType,
      idempotencyKey,
      inputSnapshotJson: JSON.stringify({ actionType, routerId: 'router-1', ruleReference, ...payload }),
      targetId: ruleReference,
      targetType: TARGET_TYPE,
    };
  }

  async function dispatchAll(...ids: string[]): Promise<void> {
    await requestRepo.claimDue(10, 'worker-1', clock.now());
    for (const requestId of ids) {
      await dispatch.execute({ requestId, workerId: 'worker-1' });
    }
  }

  it('submits idempotently, dispatches through the real adapter chain and completes successfully', async () => {
    const input = submission('add', 'block-bogons', {
      action: 'drop',
      chain: 'prerouting',
      protocol: 'tcp',
      srcAddress: '192.0.2.0/24',
    });

    const first = await requestProvisioning.execute(input);
    const repeated = await requestProvisioning.execute(input);
    expect(repeated).toEqual(first); // Idempotent request submission (same idempotencyKey)

    const [claimed] = await requestRepo.claimDue(10, 'worker-1', clock.now());
    expect(claimed?.id).to.equal(first.id);

    await dispatch.execute({ requestId: first.id, workerId: 'worker-1' });

    expect((await requestRepo.findById(first.id))?.status).to.equal('completed');
    const attempts = await attemptRepo.findByRequestId(first.id);
    expect(attempts).to.have.length(1);
    expect(attempts[0]?.outcome).to.equal('succeeded');

    expect(fakeClient.rawRules).to.have.length(1);
    expect(fakeClient.rawRules[0]).to.include({
      action: 'drop',
      chain: 'prerouting',
      protocol: 'tcp',
      ruleReference: 'block-bogons',
      srcAddress: '192.0.2.0/24',
    });
    expect(fakeClient.rawRules[0]?.comment).to.equal('cuzonet:firewall-raw:block-bogons');
  });

  it('provisions an address-list rule carrying its list and timeout', async () => {
    const request = await requestProvisioning.execute(
      submission('add', 'marcar-escaneos', {
        action: 'add-src-to-address-list',
        addressList: 'escaneos',
        addressListTimeout: '1h',
        chain: 'prerouting',
      }),
    );

    await dispatchAll(request.id);

    expect((await requestRepo.findById(request.id))?.status).to.equal('completed');
    expect(fakeClient.rawRules[0]).to.include({
      action: 'add-src-to-address-list',
      addressList: 'escaneos',
      addressListTimeout: '1h',
    });
  });

  it('identifies the rule by its Raw comment marker across dispatches, surviving a .id change on the router', async () => {
    await fakeClient.createRawRule({
      action: 'drop',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-raw:block-bogons',
    });
    const originalId = fakeClient.rawRules[0]!.id;

    // Simula un ciclo export/restore en el router: el recurso conserva su marcador de
    // comentario pero recibe un `.id` interno nuevo.
    fakeClient.rawRules[0] = { ...fakeClient.rawRules[0]!, id: '*999' };
    expect(fakeClient.rawRules[0]?.id).not.to.equal(originalId);

    const request = await requestProvisioning.execute(submission('remove', 'block-bogons', {}));
    await dispatchAll(request.id);

    expect((await requestRepo.findById(request.id))?.status).to.equal('completed');
    expect(fakeClient.rawRules).to.have.length(0);
  });

  it('runs the full lifecycle add -> update -> disable -> move -> remove through the engine', async () => {
    const add = await requestProvisioning.execute(
      submission('add', 'ciclo', { action: 'accept', chain: 'prerouting', protocol: 'tcp' }),
    );
    const filler = await requestProvisioning.execute(
      submission('add', 'relleno', { action: 'accept', chain: 'prerouting' }),
    );
    const update = await requestProvisioning.execute(submission('update', 'ciclo', { protocol: 'udp' }));
    const disable = await requestProvisioning.execute(submission('disable', 'ciclo', {}));
    const move = await requestProvisioning.execute(submission('move', 'ciclo', { position: 1 }));

    await dispatchAll(add.id, filler.id, update.id, disable.id, move.id);

    for (const request of [add, filler, update, disable, move]) {
      expect((await requestRepo.findById(request.id))?.status, request.id).to.equal('completed');
    }
    expect(fakeClient.rawRules.map((r) => r.ruleReference)).to.deep.equal(['relleno', 'ciclo']);
    expect(fakeClient.rawRules[1]).to.include({ disabled: true, protocol: 'udp' });

    const remove = await requestProvisioning.execute(submission('remove', 'ciclo', {}));
    await dispatchAll(remove.id);

    expect((await requestRepo.findById(remove.id))?.status).to.equal('completed');
    expect(fakeClient.rawRules.map((r) => r.ruleReference)).to.deep.equal(['relleno']);
  });

  /** El engine debe registrar el fallo permanente sin reintentar ni tocar el router. */
  it('records a permanent failure when the reference resolves to two rules', async () => {
    for (let i = 0; i < 2; i += 1) {
      await fakeClient.createRawRule({
        action: 'drop',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-raw:duplicada',
      });
    }

    const request = await requestProvisioning.execute(submission('remove', 'duplicada', {}));
    await dispatchAll(request.id);

    const failed = await requestRepo.findById(request.id);
    expect(failed?.status).to.equal('failed');
    expect(failed?.lastErrorCode).to.equal('ROUTEROS_RAW_RULE_AMBIGUOUS');
    expect(fakeClient.rawRules).to.have.length(2);
  });

  it('rejects a submission whose targetType is not a Raw rule, without touching the router', async () => {
    const request = await requestProvisioning.execute({
      ...submission('add', 'block-bogons', { action: 'drop', chain: 'prerouting' }),
      targetType: 'mangle-rule',
    });

    await dispatchAll(request.id);

    const failed = await requestRepo.findById(request.id);
    expect(failed?.status).to.equal('failed');
    expect(failed?.lastErrorCode).to.equal('ROUTEROS_INVALID_TARGET_TYPE');
    expect(fakeClient.rawRules).to.have.length(0);
  });

  it('rejects notrack at the boundary, since it is not a certified capability', async () => {
    const request = await requestProvisioning.execute(
      submission('add', 'sin-conntrack', { action: 'notrack', chain: 'prerouting' }),
    );

    await dispatchAll(request.id);

    const failed = await requestRepo.findById(request.id);
    expect(failed?.status).to.equal('failed');
    expect(failed?.lastErrorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    expect(fakeClient.rawRules).to.have.length(0);
  });
});
