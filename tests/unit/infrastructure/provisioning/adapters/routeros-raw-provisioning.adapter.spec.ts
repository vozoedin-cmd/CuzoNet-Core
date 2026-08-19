import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  ObservedRawRule,
  RouterOsClientFactoryPort,
} from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsRawProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-raw-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

const TARGET_TYPE = 'Firewall Raw Rule';

function input(
  actionType: string,
  payload: Record<string, unknown>,
  overrides: Partial<ProvisioningActionInput> = {},
): ProvisioningActionInput {
  return {
    actionType,
    attemptNumber: 1,
    companyId: 'company-1',
    configurationReference: undefined,
    idempotencyKey: 'key-1',
    inputSnapshotJson: JSON.stringify({ actionType, ...payload }),
    requestId: 'req-1',
    target: { id: typeof payload.ruleReference === 'string' ? payload.ruleReference : 'target-1', type: TARGET_TYPE },
    ...overrides,
  };
}

describe('RouterOsRawProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsRawProvisioningAdapter {
    return new RouterOsRawProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
  }

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
    secretProvider = { getSecret: async () => 'router-secret' };
    // Refleja SystemRouterOsClientFactory: el adapter base cierra el cliente tras cada
    // execute, y el factory real abre una conexion nueva en el siguiente despacho.
    clientFactory = {
      create: async () => {
        fakeClient.closed = false;
        return fakeClient;
      },
    };
  });

  const ADD = {
    action: 'drop',
    chain: 'prerouting',
    routerId: 'router-1',
    ruleReference: 'block-bogons',
  } as const;

  describe('add', () => {
    it('creates a rule carrying the Raw comment marker and returns success', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, comment: 'Bloqueo de bogons', protocol: 'tcp' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(1);
      expect(fakeClient.rawRules[0]?.comment).to.equal('cuzonet:firewall-raw:block-bogons Bloqueo de bogons');
      expect(fakeClient.rawRules[0]).to.include({ action: 'drop', chain: 'prerouting', protocol: 'tcp' });
    });

    it('places the new rule at the requested position', async () => {
      for (const reference of ['r1', 'r2']) {
        await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', { ...ADD, ruleReference: reference }),
        );
      }

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, position: 1, ruleReference: 'r0' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    it('is idempotent when the existing rule already matches', async () => {
      const payload = input('routeros.firewall.raw.add', { ...ADD, protocol: 'tcp' });
      await adapterFor('routeros.firewall.raw.add').execute(payload);

      const result = await adapterFor('routeros.firewall.raw.add').execute(payload);

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, protocol: 'tcp' }),
      );

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, protocol: 'udp' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_CONFLICT');
      }
      expect(fakeClient.rawRules).to.have.length(1);
    });
  });

  /**
   * `log` es el campo con riesgo de asimetria en Raw, el analogo de `passthrough` en Mangle.
   * La diferencia decisiva: aqui la ausencia significa `false` en AMBOS lados, porque el
   * router omite el campo cuando no esta activo. Por eso omitirlo y declararlo `false` son
   * equivalentes, al reves que en Mangle.
   */
  describe('log equivalence', () => {
    async function seed(log?: boolean): Promise<void> {
      await fakeClient.createRawRule({
        action: 'drop',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-raw:block-bogons',
        ...(log === undefined ? {} : { log }),
      });
    }

    const addWith = (log?: boolean): Record<string, unknown> => ({
      ...ADD,
      ...(log === undefined ? {} : { log }),
    });

    const EQUIVALENT = [
      ['omitted', undefined, undefined],
      ['omitted', undefined, false],
      ['false', false, undefined],
      ['false', false, false],
      ['true', true, true],
    ] as const;

    it.each(EQUIVALENT)('payload %s vs observed %s: idempotent success', async (_label, payload, observed) => {
      await seed(observed);

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', addWith(payload)),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(1);
    });

    const CONFLICTING = [
      ['true', true, undefined],
      ['true', true, false],
      ['omitted', undefined, true],
      ['false', false, true],
    ] as const;

    it.each(CONFLICTING)('payload %s vs observed %s: conflict', async (_label, payload, observed) => {
      await seed(observed);

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', addWith(payload)),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_CONFLICT');
      }
    });

    it('a rule created without stating log carries no log at all', async () => {
      await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', ADD));

      expect(fakeClient.rawRules[0]).to.not.have.property('log');
    });
  });

  describe('action/companion coherence', () => {
    it('rejects jump without jumpTarget at the schema layer', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, action: 'jump' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
      expect(fakeClient.rawRules).to.have.length(0);
    });

    it.each([['add-src-to-address-list'], ['add-dst-to-address-list']])(
      'rejects %s without addressList at the schema layer',
      async (action) => {
        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', { ...ADD, action }),
        );

        expect(result.outcome).to.equal('permanentFailure');
        expect(fakeClient.rawRules).to.have.length(0);
      },
    );

    /**
     * Direccion inversa, encontrada por la certificacion E2E de la Fase 6: el router descarta
     * `jump-target` en silencio si la accion no es `jump`. Antes la regla se creaba y solo la
     * postcondicion detectaba la divergencia, ya con la regla puesta en el router; ahora se
     * rechaza en la frontera y no se envia comando alguno.
     */
    it.each([['accept'], ['drop']])('rejects add with action=%s carrying a jumpTarget', async (action) => {
      const createSpy = vi.spyOn(fakeClient, 'createRawRule');

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, action, jumpTarget: 'mi-chain' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
      expect(createSpy).not.toHaveBeenCalled();
      expect(fakeClient.rawRules).to.have.length(0);
    });

    it('accepts add with action=jump and its jumpTarget', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, action: 'jump', jumpTarget: 'mi-chain' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]).to.include({ action: 'jump', jumpTarget: 'mi-chain' });
    });

    /**
     * La comprobacion que el esquema NO puede hacer: el patch cambia solo la accion y el
     * acompanante tendria que venir de la regla que ya esta en el router.
     */
    it('rejects an update that switches to jump when the existing rule has no jumpTarget', async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons',
      });

      const result = await adapterFor('routeros.firewall.raw.update').execute(
        input('routeros.firewall.raw.update', { action: 'jump', routerId: 'router-1', ruleReference: 'block-bogons' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_RAW_RULE');
      }
      expect(fakeClient.rawRules[0]?.action).to.equal('drop');
    });

    it('accepts an update that switches to jump when the existing rule already carries jumpTarget', async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons', jumpTarget: 'mi-chain',
      });

      const result = await adapterFor('routeros.firewall.raw.update').execute(
        input('routeros.firewall.raw.update', { action: 'jump', routerId: 'router-1', ruleReference: 'block-bogons' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]?.action).to.equal('jump');
    });

    it('accepts an update that supplies action and companion together', async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons',
      });

      const result = await adapterFor('routeros.firewall.raw.update').execute(
        input('routeros.firewall.raw.update', {
          action: 'add-src-to-address-list', addressList: 'sospechosos',
          routerId: 'router-1', ruleReference: 'block-bogons',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]).to.include({ action: 'add-src-to-address-list', addressList: 'sospechosos' });
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons', protocol: 'tcp',
      });
    });

    const update = (payload: Record<string, unknown>) =>
      adapterFor('routeros.firewall.raw.update').execute(
        input('routeros.firewall.raw.update', { routerId: 'router-1', ruleReference: 'block-bogons', ...payload }),
      );

    it('updates only the changed fields', async () => {
      const result = await update({ srcAddress: '10.0.0.0/8' });

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]).to.include({ protocol: 'tcp', srcAddress: '10.0.0.0/8' });
    });

    it('is idempotent when nothing actually changes', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateRawRule');

      const result = await update({ protocol: 'tcp' });

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each([['log'], ['disabled']] as const)('applies an explicit %s=true', async (field) => {
      const result = await update({ [field]: true });

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]?.[field]).to.equal(true);
    });

    it('applies an explicit disabled=false on a disabled rule', async () => {
      await update({ disabled: true });

      await update({ disabled: false });

      expect(fakeClient.rawRules[0]?.disabled).to.equal(false);
    });

    /** `log` ausente ya significa `false`: reenviarlo seria un `/set` sin efecto. */
    it('does not send an update when log=false is requested on a rule that never had it', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateRawRule');

      const result = await update({ log: false });

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('fails permanently when the rule does not exist', async () => {
      const result = await adapterFor('routeros.firewall.raw.update').execute(
        input('routeros.firewall.raw.update', { protocol: 'udp', routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
      }
    });

    it('mutates by .id, never by the managed reference', async () => {
      const expectedId = fakeClient.rawRules[0]!.id;
      const updateSpy = vi.spyOn(fakeClient, 'updateRawRule');

      await update({ srcAddress: '10.0.0.0/8' });

      expect(updateSpy).toHaveBeenCalledWith({ id: expectedId, kind: 'id' }, { srcAddress: '10.0.0.0/8' });
    });
  });

  describe('move', () => {
    beforeEach(async () => {
      for (const reference of ['r1', 'r2', 'r3']) {
        await fakeClient.createRawRule({
          action: 'accept', chain: 'prerouting', comment: `cuzonet:firewall-raw:${reference}`,
        });
      }
    });

    const move = (ruleReference: string, position: number) =>
      adapterFor('routeros.firewall.raw.move').execute(
        input('routeros.firewall.raw.move', { position, routerId: 'router-1', ruleReference }),
      );

    it('moves a rule to the requested position', async () => {
      const result = await move('r3', 0);

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('moves a rule to the end', async () => {
      const result = await move('r1', 2);

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r3', 'r1']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      const moveSpy = vi.spyOn(fakeClient, 'moveRawRule');

      const result = await move('r1', 0);

      expect(result.outcome).to.equal('success');
      expect(moveSpy).not.toHaveBeenCalled();
    });

    it('fails permanently when the rule does not exist', async () => {
      const result = await move('missing', 0);

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable and disable', () => {
    beforeEach(async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons', disabled: true,
      });
    });

    const run = (operation: 'enable' | 'disable') =>
      adapterFor(`routeros.firewall.raw.${operation}`).execute(
        input(`routeros.firewall.raw.${operation}`, { routerId: 'router-1', ruleReference: 'block-bogons' }),
      );

    it('enables a disabled rule', async () => {
      const result = await run('enable');

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules[0]?.disabled).to.equal(false);
    });

    it('is idempotent when already disabled, without touching the router', async () => {
      const disableSpy = vi.spyOn(fakeClient, 'disableRawRule');

      const result = await run('disable');

      expect(result.outcome).to.equal('success');
      expect(disableSpy).not.toHaveBeenCalled();
    });

    it('is idempotent when already enabled, without touching the router', async () => {
      await run('enable');
      const enableSpy = vi.spyOn(fakeClient, 'enableRawRule');

      const result = await run('enable');

      expect(result.outcome).to.equal('success');
      expect(enableSpy).not.toHaveBeenCalled();
    });

    it.each(['enable', 'disable'] as const)('%s fails permanently when the rule does not exist', async (operation) => {
      const result = await adapterFor(`routeros.firewall.raw.${operation}`).execute(
        input(`routeros.firewall.raw.${operation}`, { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    const remove = (ruleReference: string) =>
      adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference }),
      );

    it('removes an existing rule', async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons',
      });

      const result = await remove('block-bogons');

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      expect((await remove('missing')).outcome).to.equal('success');
    });
  });

  /**
   * RouterOS no impone unicidad sobre el marcador del comentario. En Raw quedarse con la
   * primera es especialmente danino: estas reglas deciden que trafico entra al conntrack.
   */
  describe('ambiguous managed reference', () => {
    const BASE = {
      action: 'drop',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-raw:block-bogons',
    } as const;

    beforeEach(async () => {
      await fakeClient.createRawRule(BASE);
      await fakeClient.createRawRule(BASE);
      expect(fakeClient.rawRules).to.have.length(2);
    });

    const OPERATIONS = [
      ['add', 'createRawRule', { action: 'drop', chain: 'prerouting' }],
      ['update', 'updateRawRule', { protocol: 'udp' }],
      ['move', 'moveRawRule', { position: 0 }],
      ['enable', 'enableRawRule', {}],
      ['disable', 'disableRawRule', {}],
      ['remove', 'removeRawRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with AMBIGUOUS and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.raw.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: 'block-bogons', ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_AMBIGUOUS');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.rawRules).to.have.length(2);
    });

    it('names every candidate id so the operator can resolve it on the router', async () => {
      const ids = fakeClient.rawRules.map((rule) => rule.id);

      const result = await adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'block-bogons' }),
      );

      if (result.outcome === 'permanentFailure') {
        for (const id of ids) expect(result.errorMessage).to.contain(id);
      }
    });
  });

  describe('dynamic rule guard', () => {
    beforeEach(async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:dinamica',
      });
      fakeClient.rawRules[0] = { ...fakeClient.rawRules[0]!, dynamic: true };
    });

    const OPERATIONS = [
      ['add', 'createRawRule', { action: 'drop', chain: 'prerouting' }],
      ['update', 'updateRawRule', { protocol: 'udp' }],
      ['move', 'moveRawRule', { position: 0 }],
      ['enable', 'enableRawRule', {}],
      ['disable', 'disableRawRule', {}],
      ['remove', 'removeRawRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with DYNAMIC and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.raw.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: 'dinamica', ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_DYNAMIC');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.rawRules[0]?.dynamic).to.equal(true);
    });

    it('still reports NOT_FOUND, not DYNAMIC, when no rule carries the reference', async () => {
      const result = await adapterFor('routeros.firewall.raw.enable').execute(
        input('routeros.firewall.raw.enable', { routerId: 'router-1', ruleReference: 'no-existe' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
      }
    });
  });

  /**
   * OWNERSHIP, capa 1: alcanzabilidad. `parseOwnership` solo adjunta `ruleReference` al
   * estado `valid`, y toda operacion resuelve por esa referencia, asi que foreign, malformed
   * y unmanaged son INALCANZABLES por construccion.
   */
  describe('ownership reachability', () => {
    const NON_VALID = [
      ['foreign', 'cuzonet:firewall-nat:algo'],
      ['malformed', 'cuzonet:firewall-raw:'],
      ['unmanaged', 'puesta a mano por el operador'],
    ] as const;

    it.each(NON_VALID)('a %s rule is invisible to update/enable/disable/move: they report NOT_FOUND', async (_status, comment) => {
      await fakeClient.createRawRule({ action: 'accept', chain: 'prerouting', comment });

      for (const [operation, payload] of [
        ['update', { protocol: 'udp' }],
        ['enable', {}],
        ['disable', {}],
        ['move', { position: 0 }],
      ] as const) {
        const actionType = `routeros.firewall.raw.${operation}`;
        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'cualquiera', ...payload }),
        );

        expect(result.outcome, operation).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, operation).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
        }
      }
      expect(fakeClient.rawRules).to.have.length(1);
      expect(fakeClient.rawRules[0]?.comment).to.equal(comment);
    });

    it.each(NON_VALID)('remove never deletes a %s rule: it reports idempotent success instead', async (_status, comment) => {
      await fakeClient.createRawRule({ action: 'accept', chain: 'prerouting', comment });

      const result = await adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'cualquiera' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(1);
    });

    it.each(NON_VALID)('add does not adopt a %s rule: it creates a new managed one alongside', async (_status, comment) => {
      await fakeClient.createRawRule({ action: 'accept', chain: 'prerouting', comment });

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, ruleReference: 'nueva' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.rawRules).to.have.length(2);
      expect(fakeClient.rawRules[0]?.comment).to.equal(comment);
      expect(fakeClient.rawRules[1]?.comment).to.equal('cuzonet:firewall-raw:nueva');
    });
  });

  /** OWNERSHIP, capa 2: la guarda defensiva, forzando el escenario contra el que protege. */
  describe('ownership guard (defensive)', () => {
    function resolveAs(status: 'foreign' | 'malformed' | 'unmanaged', overrides: Partial<ObservedRawRule> = {}): void {
      vi.spyOn(fakeClient, 'findRawRulesByReference').mockResolvedValue([
        {
          action: 'drop',
          bytes: 0,
          chain: 'prerouting',
          disabled: false,
          dynamic: false,
          id: '*7',
          invalid: false,
          ownership: { status },
          packets: 0,
          physicalIndex: 0,
          ...overrides,
        },
      ]);
    }

    const STATUSES = ['foreign', 'malformed', 'unmanaged'] as const;

    const MUTATIONS = [
      ['update', 'updateRawRule', { protocol: 'udp' }],
      ['move', 'moveRawRule', { position: 0 }],
      ['enable', 'enableRawRule', {}],
      ['disable', 'disableRawRule', {}],
      ['remove', 'removeRawRule', {}],
    ] as const;

    it.each(STATUSES)('refuses every mutation on a %s rule, without touching the router', async (status) => {
      for (const [operation, clientMethod, payload] of MUTATIONS) {
        resolveAs(status);
        const spy = vi.spyOn(fakeClient, clientMethod);
        const actionType = `routeros.firewall.raw.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'guarded', ...payload }),
        );

        expect(result.outcome, `${status}/${operation}`).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, `${status}/${operation}`).to.equal('ROUTEROS_RAW_RULE_OWNERSHIP_VIOLATION');
        }
        expect(spy, `${status}/${operation}`).not.toHaveBeenCalled();
        vi.restoreAllMocks();
      }
    });

    it.each(STATUSES)('refuses add when the reference resolves to a %s rule', async (status) => {
      resolveAs(status);
      const createSpy = vi.spyOn(fakeClient, 'createRawRule');

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, ruleReference: 'guarded' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_OWNERSHIP_VIOLATION');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reports the offending status and rule id in the message', async () => {
      resolveAs('foreign');

      const result = await adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'guarded' }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain('foreign');
        expect(result.errorMessage).to.contain('*7');
      }
    });

    it('ownership is checked before the dynamic guard: a foreign dynamic rule reports ownership', async () => {
      resolveAs('foreign', { dynamic: true });

      const result = await adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'guarded' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_OWNERSHIP_VIOLATION');
      }
    });
  });

  describe('postconditions', () => {
    const addPayload = { ...ADD, protocol: 'tcp' };

    describe('create', () => {
      it('re-reads and succeeds when exactly one equivalent rule carries the reference', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findRawRulesByReference');

        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(2);
      });

      it('fails with POSTCONDITION_FAILED when the router accepted the add but persisted nothing', async () => {
        vi.spyOn(fakeClient, 'createRawRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_POSTCONDITION_FAILED');
        }
      });

      it('fails with POSTCONDITION_FAILED when the add left a duplicate reference', async () => {
        const original = fakeClient.createRawRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createRawRule').mockImplementationOnce(async (rule) => {
          await original(rule);
          await original(rule);
        });

        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain('2');
        }
      });

      it('fails with POSTCONDITION_FAILED when the created rule does not match what was asked', async () => {
        const original = fakeClient.createRawRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createRawRule').mockImplementationOnce(async (rule) => {
          await original({ ...rule, protocol: 'udp' });
        });

        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_POSTCONDITION_FAILED');
        }
      });

      it('does not re-read when the create was an idempotent no-op', async () => {
        await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', addPayload));
        const findSpy = vi.spyOn(fakeClient, 'findRawRulesByReference');

        const result = await adapterFor('routeros.firewall.raw.add').execute(
          input('routeros.firewall.raw.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('remove', () => {
      beforeEach(async () => {
        await fakeClient.createRawRule({
          action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons', protocol: 'tcp',
        });
      });

      it('re-reads and succeeds once the rule is gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findRawRulesByReference');

        const result = await adapterFor('routeros.firewall.raw.remove').execute(
          input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'block-bogons' }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(2);
      });

      it('fails with POSTCONDITION_FAILED when the rule survives the removal', async () => {
        vi.spyOn(fakeClient, 'removeRawRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.raw.remove').execute(
          input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'block-bogons' }),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_POSTCONDITION_FAILED');
        }
        expect(fakeClient.rawRules).to.have.length(1);
      });

      it('does not re-read when the rule was already gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findRawRulesByReference');

        const result = await adapterFor('routeros.firewall.raw.remove').execute(
          input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'nunca-existio' }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('operations that deliberately do not re-read', () => {
      beforeEach(async () => {
        await fakeClient.createRawRule({
          action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:block-bogons', protocol: 'tcp',
        });
      });

      it.each([
        ['update', { protocol: 'udp' }],
        ['enable', {}],
        ['disable', {}],
      ] as const)('%s resolves once and trusts the router confirmation', async (operation, payload) => {
        const findSpy = vi.spyOn(fakeClient, 'findRawRulesByReference');
        const actionType = `routeros.firewall.raw.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'block-bogons', ...payload }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  /** Coherencia entre el sobre de la solicitud y su carga util, cableada desde la Fase 1. */
  describe('envelope coherence', () => {
    it('rejects a wrong targetType before touching anything', async () => {
      const createSpy = vi.spyOn(fakeClient, 'createRawRule');

      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', ADD, { target: { id: 'block-bogons', type: 'Firewall Filter Rule' } }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_TARGET_TYPE');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects an actionType that contradicts the payload', async () => {
      const result = await adapterFor('routeros.firewall.raw.remove').execute({
        ...input('routeros.firewall.raw.add', ADD),
        actionType: 'routeros.firewall.raw.remove',
      });

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_ACTION_MISMATCH');
      }
    });

    it('rejects a targetId that does not name the rule in the payload', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', ADD, { target: { id: 'otra-regla', type: TARGET_TYPE } }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_TARGET_MISMATCH');
      }
    });
  });

  describe('RouterOS trap mapping', () => {
    function trapOnCreate(message: string): void {
      vi.spyOn(fakeClient, 'createRawRule').mockRejectedValueOnce(
        Object.assign(new Error(message), { name: 'RouterOSTrapError' }),
      );
    }

    const VALIDATION_TRAPS = [
      'input does not match any value of action',
      'input does not match any value of protocol',
      'input does not match any value of in-interface',
      'unknown parameter connection-state',
      'invalid value for argument packet-mark',
    ];

    it.each(VALIDATION_TRAPS)('maps "%s" to ROUTEROS_INVALID_RAW_RULE', async (message) => {
      trapOnCreate(message);

      const result = await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', ADD));

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_RAW_RULE');
        expect(result.errorMessage).to.equal(message);
      }
    });

    it('maps "no such item" to ROUTEROS_RAW_RULE_NOT_FOUND', async () => {
      await fakeClient.createRawRule({
        action: 'drop', chain: 'prerouting', comment: 'cuzonet:firewall-raw:vanished',
      });
      vi.spyOn(fakeClient, 'removeRawRule').mockRejectedValueOnce(new Error('no such item'));

      const result = await adapterFor('routeros.firewall.raw.remove').execute(
        input('routeros.firewall.raw.remove', { routerId: 'router-1', ruleReference: 'vanished' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_NOT_FOUND');
      }
    });

    it('maps "failure: already have such entry" to ROUTEROS_RAW_RULE_CONFLICT', async () => {
      trapOnCreate('failure: already have such entry');

      const result = await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', ADD));

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_RAW_RULE_CONFLICT');
      }
    });

    it('leaves a bare "failure" on the generic fallback', async () => {
      trapOnCreate('failure');

      const result = await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', ADD));

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_FAILED');
      }
    });

    it('still classifies a timeout as a temporary failure', async () => {
      trapOnCreate('command timeout after 2000ms');

      const result = await adapterFor('routeros.firewall.raw.add').execute(input('routeros.firewall.raw.add', ADD));

      expect(result.outcome).to.equal('temporaryFailure');
      if (result.outcome === 'temporaryFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_TIMEOUT');
      }
    });
  });

  describe('payload validation', () => {
    it('rejects an invalid JSON payload', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute({
        ...input('routeros.firewall.raw.add', ADD),
        inputSnapshotJson: '{ invalid json }',
      });

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
      }
    });

    it('rejects notrack, which is not a certified capability', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, action: 'notrack' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
      expect(fakeClient.rawRules).to.have.length(0);
    });

    it.each([['input'], ['forward'], ['postrouting']])('rejects the non-built-in chain %s', async (chain) => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, chain }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      expect(fakeClient.rawRules).to.have.length(0);
    });

    it('rejects a conntrack field Raw does not have', async () => {
      const result = await adapterFor('routeros.firewall.raw.add').execute(
        input('routeros.firewall.raw.add', { ...ADD, connectionState: 'new' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
    });
  });
});
