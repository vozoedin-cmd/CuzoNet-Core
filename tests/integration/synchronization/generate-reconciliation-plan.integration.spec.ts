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

  /**
   * Mangle de punta a punta: historial de aprovisionamiento -> estado deseado -> lectura del
   * router -> plan. Es el unico recurso con un campo que el router materializa siempre y el
   * deseado puede omitir, asi que la matriz de `passthrough` se ejercita aqui, sobre el
   * motor completo y no sobre el comparador aislado.
   */
  describe('Mangle rules', () => {
    const ADD = {
      action: 'mark-connection',
      chain: 'prerouting',
      newConnectionMark: 'voip-conn',
      routerId: 'router-1',
    } as const;

    async function desire(reference: string, extra: Record<string, unknown> = {}): Promise<void> {
      await requestRepo.save(
        completedRequest(
          'routeros.firewall.mangle.add',
          { ...ADD, ruleReference: reference, ...extra },
          new Date('2026-07-01T00:00:00.000Z'),
        ),
      );
    }

    async function onRouter(reference: string, extra: Record<string, unknown> = {}): Promise<void> {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: `cuzonet:firewall-mangle:${reference}`,
        newConnectionMark: 'voip-conn',
        ...extra,
      });
    }

    const MATRIX = [
      ['desired omits passthrough, router materialised true', {}, {}, 'in_sync'],
      ['desired true, router true', { passthrough: true }, { passthrough: true }, 'in_sync'],
      ['desired false, router false', { passthrough: false }, { passthrough: false }, 'in_sync'],
      ['desired omits passthrough, router has false', {}, { passthrough: false }, 'drifted'],
      ['desired false, router true', { passthrough: false }, { passthrough: true }, 'drifted'],
      ['desired true, router false', { passthrough: true }, { passthrough: false }, 'drifted'],
    ] as const;

    it.each(MATRIX)('%s -> %s', async (_label, desiredExtra, actualExtra, expected) => {
      await desire('marca', desiredExtra);
      await onRouter('marca', actualExtra);

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.have.length(1);
      expect(plan.items[0]?.status).to.equal(expected);
      if (expected === 'drifted') {
        expect(plan.items[0]?.differingFields).to.deep.equal(['passthrough']);
      }
      expect(plan.summary.isConverged).to.equal(expected === 'in_sync');
    });

    /**
     * Una regla dinamica la gobierna RouterOS. No debe aparecer como recurso administrable:
     * ni como `unexpected` (inventaria divergencia) ni como candidato de nada.
     */
    it('never reports a dynamic Mangle rule, in any status', async () => {
      await onRouter('generada-por-el-router');
      fakeClient.mangleRules = fakeClient.mangleRules.map((rule) => ({ ...rule, dynamic: true }));

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.deep.equal([]);
      expect(plan.summary.unexpected).to.equal(0);
      expect(plan.summary.isConverged).to.equal(true);
    });

    /**
     * GAP acotado y documentado: si una regla dinamica llevara marcador administrado valido,
     * excluirla del estado real deja su referencia como `missing`. No se ha observado —las
     * dinamicas las genera el router con sus propios comentarios— y la guarda
     * ROUTEROS_MANGLE_RULE_DYNAMIC del adapter es el respaldo si un apply lo intentara.
     */
    it('GAP: a dynamic rule carrying a managed reference reads as missing, never as in_sync', async () => {
      await desire('marca');
      await onRouter('marca');
      fakeClient.mangleRules = fakeClient.mangleRules.map((rule) => ({ ...rule, dynamic: true }));

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.have.length(1);
      expect(plan.items[0]?.status).to.equal('missing');
    });

    const NON_VALID_OWNERSHIP = [
      ['unmanaged', 'marcado puesto a mano por el operador'],
      ['foreign', 'cuzonet:firewall-nat:otra-cosa'],
      ['malformed', 'cuzonet:firewall-mangle:'],
    ] as const;

    /**
     * `unexpected` significa "CuzoNet no es su duenyo", nunca "hay que borrarla". Una regla
     * de marcado escrita a mano suele ser la base del QoS del router.
     */
    it.each(NON_VALID_OWNERSHIP)('reports a %s rule without ever making it actionable', async (_status, comment) => {
      await fakeClient.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment, newPacketMark: 'bulk',
      });

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.have.length(1);
      expect(plan.items[0]?.status).to.equal('unexpected');
      expect(plan.items[0]?.reference).to.match(/^unmanaged:/);
      expect(plan.items[0]?.desiredFields).to.equal(undefined);
      expect(plan.summary).to.include({ drifted: 0, missing: 0, unexpected: 1 });
      expect(plan.mode).to.equal('dry-run');
      // Sigue en el router: un plan dry-run no borra nada, y `unexpected` no es accionable.
      expect(fakeClient.mangleRules).to.have.length(1);
    });

    /**
     * Dos reglas reales con la misma referencia: no hay candidato seguro. Un unico item
     * ambiguous, con los dos candidatos conservados para diagnostico y sin accion posible.
     */
    it('collapses two rules sharing a managed reference into one ambiguous item', async () => {
      await desire('marca');
      await onRouter('marca');
      await onRouter('marca', { passthrough: false });

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.have.length(1);
      const item = plan.items[0];
      expect(item?.status).to.equal('ambiguous');
      expect(item?.reference).to.equal('marca');
      expect(item?.actualMatchCount).to.equal(2);
      expect(item?.actualCandidates).to.have.length(2);
      expect(item?.actualCandidates?.map((c) => c.fields.passthrough)).to.deep.equal(['true', 'false']);
      // Ni actualFields ni differingFields: no se elige un candidato arbitrario.
      expect(item?.actualFields).to.equal(undefined);
      expect(item?.differingFields).to.equal(undefined);
      expect(plan.summary).to.deep.equal({
        ambiguous: 1,
        drifted: 0,
        inSync: 0,
        isConverged: false,
        missing: 0,
        total: 1,
        unexpected: 0,
      });
    });

    it('reports an ambiguous reference even when nothing desired it', async () => {
      await onRouter('duplicada');
      await onRouter('duplicada');

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items[0]).to.include({ reference: 'duplicada', status: 'ambiguous' });
      expect(plan.items[0]?.desiredFields).to.equal(undefined);
      expect(plan.summary.isConverged).to.equal(false);
    });

    it('classifies in_sync, missing, drifted, unexpected and ambiguous in a single run', async () => {
      await desire('ok');
      await onRouter('ok');

      await desire('nunca-creada');

      await desire('cambiada', { protocol: 'udp' });
      await onRouter('cambiada', { protocol: 'tcp' });

      await fakeClient.createMangleRule({
        action: 'mark-packet', chain: 'forward', comment: 'del operador', newPacketMark: 'bulk',
      });

      await desire('duplicada');
      await onRouter('duplicada');
      await onRouter('duplicada');

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      const byReference = new Map(plan.items.map((item) => [item.reference, item]));
      expect(byReference.get('ok')?.status).to.equal('in_sync');
      expect(byReference.get('nunca-creada')?.status).to.equal('missing');
      expect(byReference.get('cambiada')?.status).to.equal('drifted');
      expect(byReference.get('cambiada')?.differingFields).to.deep.equal(['protocol']);
      expect(byReference.get('duplicada')?.status).to.equal('ambiguous');
      expect(plan.summary).to.deep.equal({
        ambiguous: 1,
        drifted: 1,
        inSync: 1,
        isConverged: false,
        missing: 1,
        total: 5,
        unexpected: 1,
      });
    });

    it('a rule removed from the history is no longer desired, and the leftover shows as unexpected', async () => {
      await desire('temporal');
      await requestRepo.save(
        completedRequest(
          'routeros.firewall.mangle.remove',
          { routerId: 'router-1', ruleReference: 'temporal' },
          new Date('2026-07-02T00:00:00.000Z'),
        ),
      );
      await onRouter('temporal');

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items).to.have.length(1);
      expect(plan.items[0]).to.include({ reference: 'temporal', status: 'unexpected' });
    });

    it('a disable recorded in the history drifts against a rule still enabled on the router', async () => {
      await desire('marca');
      await requestRepo.save(
        completedRequest(
          'routeros.firewall.mangle.disable',
          { routerId: 'router-1', ruleReference: 'marca' },
          new Date('2026-07-02T00:00:00.000Z'),
        ),
      );
      await onRouter('marca');

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items[0]?.status).to.equal('drifted');
      expect(plan.items[0]?.differingFields).to.deep.equal(['disabled']);
    });

    /** El comentario de usuario no forma parte del estado deseado de una regla. */
    it('does not drift when only the user comment differs', async () => {
      await desire('marca', { comment: 'lo que el operador escribio' });
      await onRouter('marca', { comment: 'cuzonet:firewall-mangle:marca otra cosa distinta' });

      const plan = await useCase.execute({ resourceTypes: ['mangle-rule'], routerId: 'router-1' });

      expect(plan.items[0]?.status).to.equal('in_sync');
    });
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
