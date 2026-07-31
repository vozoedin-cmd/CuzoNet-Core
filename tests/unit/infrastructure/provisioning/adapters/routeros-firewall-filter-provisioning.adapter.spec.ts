import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsFirewallFilterProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-firewall-filter-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

function input(actionType: string, payload: Record<string, unknown>, requestId = 'req-1'): ProvisioningActionInput {
  return {
    actionType,
    attemptNumber: 1,
    companyId: 'company-1',
    configurationReference: undefined,
    idempotencyKey: 'key-1',
    inputSnapshotJson: JSON.stringify({ actionType, ...payload }),
    requestId,
    target: { id: payload['ruleReference'] as string ?? 'target-1', type: 'Firewall Filter Rule' },
  };
}

describe('RouterOsFirewallFilterProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsFirewallFilterProvisioningAdapter {
    return new RouterOsFirewallFilterProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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

  describe('add', () => {
    it('creates a filter rule carrying the comment marker and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          comment: 'Bloquea SSH desde WAN',
          dstPort: '22',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
          srcAddress: '203.0.113.0/24',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(1);
      expect(fakeClient.filterRules[0]?.comment).to.equal(
        'cuzonet:firewall-filter:block-ssh-wan Bloquea SSH desde WAN',
      );
      expect(fakeClient.filterRules[0]?.action).to.equal('drop');
      expect(fakeClient.filterRules[0]?.protocol).to.equal('tcp');
      expect(fakeClient.filterRules[0]?.dstPort).to.equal('22');
    });

    it('reports the ruleReference in the success metadata', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'allow-lan',
        }),
      );

      expect(result.outcome).to.equal('success');
      if (result.outcome === 'success') {
        expect(result.metadata?.ruleReference).to.equal('allow-lan');
      }
    });

    it('places the new rule at the requested position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          position: 1,
          routerId: 'router-1',
          ruleReference: 'r0',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    it('is idempotent when an equivalent rule already exists', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        protocol: 'tcp',
      });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'drop',
          chain: 'input',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.add');

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'reject',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_CONFLICT');
      }
    });
  });

  describe('update', () => {
    it('updates only the changed fields and preserves the marker', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.protocol).to.equal('tcp');
      expect(fakeClient.filterRules[0]?.action).to.equal('drop');
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        protocol: 'tcp',
      });
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          action: 'drop',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.update');

      const result = await adapter.execute(
        input('routeros.firewall.filter.update', {
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'missing',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('move', () => {
    it('moves a rule to the requested position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r3' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'r3' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
    });

    it('moves a rule to the end when position is beyond the last index', async () => {
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r1' });
      await fakeClient.createFilterRule({ action: 'accept', chain: 'input', comment: 'cuzonet:firewall-filter:r2' });
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 99, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.map((r) => r.ruleReference)).to.deep.equal(['r2', 'r1']);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.move');

      const result = await adapter.execute(
        input('routeros.firewall.filter.move', { position: 0, routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
        disabled: true,
      });
      const adapter = adapterFor('routeros.firewall.filter.enable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.enable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.disabled).to.equal(false);
    });

    it('is idempotent when already enabled', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.enable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.enable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  describe('disable', () => {
    it('disables an enabled rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.disable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.disabled).to.equal(true);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.filter.disable');

      const result = await adapter.execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes an existing rule and returns success', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:block-ssh-wan',
      });
      const adapter = adapterFor('routeros.firewall.filter.remove');

      const result = await adapter.execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'block-ssh-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.filter.remove');

      const result = await adapter.execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  /**
   * RouterOS no impone unicidad sobre el marcador del comentario: dos reglas pueden
   * compartir referencia tras una duplicacion manual en WinBox o una importacion de
   * configuracion. Operar sobre la primera dejaria la gemela intacta e informaria exito.
   */
  describe('ambiguous managed reference', () => {
    const REFERENCE = 'block-ssh-wan';
    const BASE = {
      action: 'drop',
      chain: 'input',
      comment: `cuzonet:firewall-filter:${REFERENCE} bloqueo SSH`,
    } as const;

    beforeEach(async () => {
      await fakeClient.createFilterRule(BASE);
      await fakeClient.createFilterRule(BASE);
      expect(fakeClient.filterRules).to.have.length(2);
    });

    const OPERATIONS = [
      ['add', 'createFilterRule', { action: 'drop', chain: 'input' }],
      ['update', 'updateFilterRule', { protocol: 'udp' }],
      ['move', 'moveFilterRule', { position: 0 }],
      ['enable', 'enableFilterRule', {}],
      ['disable', 'disableFilterRule', {}],
      ['remove', 'removeFilterRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with AMBIGUOUS and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.filter.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_AMBIGUOUS');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.filterRules).to.have.length(2);
    });

    it('names every candidate id so the operator can resolve it on the router', async () => {
      const ids = fakeClient.filterRules.map((rule) => rule.id);

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain(REFERENCE);
        for (const id of ids) expect(result.errorMessage).to.contain(id);
      }
    });

    it('does not affect a different reference that resolves to a single rule', async () => {
      await fakeClient.createFilterRule({
        action: 'accept',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:allow-lan',
      });

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'allow-lan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(2);
    });
  });

  /**
   * Las reglas dinamicas las genera RouterOS (Hotspot, IPsec) y desapareceran solas. El
   * router acepta algunos de estos comandos; la guarda es una decision de CuzoNet, porque
   * mutar algo efimero informa de un cambio que no perdura.
   */
  describe('dynamic rule guard', () => {
    const REFERENCE = 'hotspot-generated';

    beforeEach(async () => {
      await fakeClient.createFilterRule({
        action: 'accept',
        chain: 'forward',
        comment: `cuzonet:firewall-filter:${REFERENCE}`,
      });
      const rule = fakeClient.filterRules[0]!;
      fakeClient.filterRules[0] = { ...rule, dynamic: true };
    });

    const OPERATIONS = [
      ['add', 'createFilterRule', { action: 'accept', chain: 'forward' }],
      ['update', 'updateFilterRule', { protocol: 'udp' }],
      ['move', 'moveFilterRule', { position: 0 }],
      ['enable', 'enableFilterRule', {}],
      ['disable', 'disableFilterRule', {}],
      ['remove', 'removeFilterRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with DYNAMIC and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.filter.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_DYNAMIC');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.filterRules[0]?.dynamic).to.equal(true);
    });

    it('a dynamic rule can still be observed, only not mutated', async () => {
      const [observed] = await fakeClient.findFilterRulesByReference(REFERENCE);

      expect(observed?.dynamic).to.equal(true);
      expect(observed?.ownership.ruleReference).to.equal(REFERENCE);
    });

    it('still reports NOT_FOUND, not DYNAMIC, when no rule carries the reference', async () => {
      const result = await adapterFor('routeros.firewall.filter.enable').execute(
        input('routeros.firewall.filter.enable', { routerId: 'router-1', ruleReference: 'no-existe' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
      }
    });

    it('leaves a static rule with a different reference fully operable', async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: 'cuzonet:firewall-filter:static-one',
      });

      const result = await adapterFor('routeros.firewall.filter.disable').execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: 'static-one' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules.find((r) => r.ruleReference === 'static-one')?.disabled).to.equal(true);
    });
  });

  /**
   * Postcondiciones. Solo `create` y `remove` releen: son las dos operaciones cuyo efecto
   * prometido (existe / ya no existe) el `!done` de RouterOS no garantiza por si mismo. En
   * update/enable/disable/move la confirmacion del router basta, y releer duplicaria el
   * coste sin anadir informacion.
   */
  describe('postconditions', () => {
    const REFERENCE = 'block-ssh-wan';
    const addPayload = {
      action: 'drop',
      chain: 'input',
      routerId: 'router-1',
      ruleReference: REFERENCE,
    };

    describe('create', () => {
      it('re-reads and succeeds when exactly one rule carries the reference', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findFilterRulesByReference');

        const result = await adapterFor('routeros.firewall.filter.add').execute(
          input('routeros.firewall.filter.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        // Una resolucion previa y una relectura posterior.
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.filterRules).to.have.length(1);
      });

      it('fails with POSTCONDITION_FAILED when the router accepted the add but persisted nothing', async () => {
        // Router que confirma el comando y no guarda nada.
        vi.spyOn(fakeClient, 'createFilterRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.filter.add').execute(
          input('routeros.firewall.filter.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain(REFERENCE);
        }
      });

      it('fails with POSTCONDITION_FAILED when the add left a duplicate reference', async () => {
        const original = fakeClient.createFilterRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createFilterRule').mockImplementationOnce(async (rule) => {
          await original(rule);
          await original(rule); // el router duplica la regla
        });

        const result = await adapterFor('routeros.firewall.filter.add').execute(
          input('routeros.firewall.filter.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain('2');
        }
      });

      it('does not re-read when the create was an idempotent no-op', async () => {
        await fakeClient.createFilterRule({
          action: 'drop',
          chain: 'input',
          comment: `cuzonet:firewall-filter:${REFERENCE}`,
        });
        const findSpy = vi.spyOn(fakeClient, 'findFilterRulesByReference');

        const result = await adapterFor('routeros.firewall.filter.add').execute(
          input('routeros.firewall.filter.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('remove', () => {
      beforeEach(async () => {
        await fakeClient.createFilterRule({
          action: 'drop',
          chain: 'input',
          comment: `cuzonet:firewall-filter:${REFERENCE}`,
        });
      });

      it('re-reads and succeeds once the rule is gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findFilterRulesByReference');

        const result = await adapterFor('routeros.firewall.filter.remove').execute(
          input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.filterRules).to.have.length(0);
      });

      it('fails with POSTCONDITION_FAILED when the rule survives the removal', async () => {
        // Router que confirma el comando y deja la regla en su sitio.
        vi.spyOn(fakeClient, 'removeFilterRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.filter.remove').execute(
          input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_POSTCONDITION_FAILED');
        }
        expect(fakeClient.filterRules).to.have.length(1);
      });

      it('does not re-read when the rule was already gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findFilterRulesByReference');

        const result = await adapterFor('routeros.firewall.filter.remove').execute(
          input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'nunca-existio' }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('operations that deliberately do not re-read', () => {
      beforeEach(async () => {
        await fakeClient.createFilterRule({
          action: 'drop',
          chain: 'input',
          comment: `cuzonet:firewall-filter:${REFERENCE}`,
        });
      });

      const CASES = [
        ['update', { protocol: 'udp' }],
        ['enable', {}],
        ['disable', {}],
      ] as const;

      it.each(CASES)('%s resolves once and trusts the router confirmation', async (operation, payload) => {
        const findSpy = vi.spyOn(fakeClient, 'findFilterRulesByReference');
        const actionType = `routeros.firewall.filter.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  /**
   * OWNERSHIP. El adapter resuelve por referencia administrada, y `parseOwnership` solo
   * asigna `ruleReference` al estado `valid`. Eso hace que malformed, foreign y unmanaged
   * sean INALCANZABLES por construccion, no por guarda: ninguna operacion puede verlas.
   * Se certifica esa propiedad, que es la garantia real de que CuzoNet no toca reglas
   * ajenas ni reclama ownership en silencio.
   */
  describe('ownership reachability', () => {
    const FOREIGN = 'cuzonet:otra-instalacion:algo';
    const MALFORMED = 'cuzonet:firewall-filter:';
    const UNMANAGED = 'regla puesta a mano por el operador';

    it('classifies each comment shape as expected', async () => {
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment: 'cuzonet:firewall-filter:ok libre' });
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment: FOREIGN });
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment: MALFORMED });
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment: UNMANAGED });

      const observed = await fakeClient.listFilterRules();

      expect(observed.map((rule) => rule.ownership.status)).to.deep.equal([
        'valid', 'foreign', 'malformed', 'unmanaged',
      ]);
      expect(observed[0]?.ownership.ruleReference).to.equal('ok');
      // Solo `valid` lleva referencia; el resto es irresoluble para el adapter.
      for (const rule of observed.slice(1)) {
        expect(rule.ownership.ruleReference, rule.ownership.status).to.equal(undefined);
      }
    });

    const NON_VALID = [
      ['foreign', FOREIGN],
      ['malformed', MALFORMED],
      ['unmanaged', UNMANAGED],
    ] as const;

    it.each(NON_VALID)('a %s rule is invisible to update/enable/disable/move: they report NOT_FOUND', async (_status, comment) => {
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment });

      for (const [operation, payload] of [
        ['update', { protocol: 'udp' }],
        ['enable', {}],
        ['disable', {}],
        ['move', { position: 0 }],
      ] as const) {
        const actionType = `routeros.firewall.filter.${operation}`;
        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'cualquiera', ...payload }),
        );

        expect(result.outcome, operation).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, operation).to.equal('ROUTEROS_FILTER_RULE_NOT_FOUND');
        }
      }
      // La regla ajena sigue exactamente igual.
      expect(fakeClient.filterRules).to.have.length(1);
      expect(fakeClient.filterRules[0]?.comment).to.equal(comment);
    });

    it.each(NON_VALID)('remove never deletes a %s rule: it reports idempotent success instead', async (_status, comment) => {
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment });

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: 'cualquiera' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(1);
    });

    it.each(NON_VALID)('add does not adopt a %s rule: it creates a new managed one alongside', async (_status, comment) => {
      await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment });

      const result = await adapterFor('routeros.firewall.filter.add').execute(
        input('routeros.firewall.filter.add', {
          action: 'drop', chain: 'input', routerId: 'router-1', ruleReference: 'nueva',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules).to.have.length(2);
      // El comentario ajeno no se reescribe: no se reclama ownership.
      expect(fakeClient.filterRules[0]?.comment).to.equal(comment);
      expect(fakeClient.filterRules[1]?.comment).to.equal('cuzonet:firewall-filter:nueva');
    });

    it('GAP: the legacy status is declared but parseOwnership never returns it', async () => {
      const comments = ['cuzonet:firewall-filter:x', FOREIGN, MALFORMED, UNMANAGED, ' '];
      for (const comment of comments) {
        await fakeClient.createFilterRule({ action: 'drop', chain: 'input', comment });
      }

      const statuses = (await fakeClient.listFilterRules()).map((rule) => rule.ownership.status);

      expect(statuses).not.to.contain('legacy');
    });
  });

  /**
   * TRAPS. Un trap del router llega al adapter como error de ejecucion; mapExecutionError
   * decide si tiene causa conocida o cae al mapeo generico.
   */
  describe('router traps', () => {
    const REFERENCE = 'trap-target';

    const addInput = () =>
      input('routeros.firewall.filter.add', {
        action: 'drop', chain: 'input', routerId: 'router-1', ruleReference: REFERENCE,
      });

    async function seedRule(): Promise<void> {
      await fakeClient.createFilterRule({
        action: 'drop', chain: 'input', comment: `cuzonet:firewall-filter:${REFERENCE}`,
      });
    }

    const CLASSIFIED = [
      ['invalid chain value'],
      ['invalid protocol name'],
      ['invalid interface ether99'],
      ['invalid address 999.1.1.1'],
    ] as const;

    it.each(CLASSIFIED)('maps a trap reading "%s" to ROUTEROS_INVALID_FILTER_RULE', async (message) => {
      vi.spyOn(fakeClient, 'createFilterRule').mockRejectedValueOnce(new Error(message));

      const result = await adapterFor('routeros.firewall.filter.add').execute(addInput());

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_FILTER_RULE');
      }
    });

    it('falls back to ROUTEROS_EXECUTION_FAILED for an unclassified trap', async () => {
      vi.spyOn(fakeClient, 'createFilterRule').mockRejectedValueOnce(
        new Error('failure: already have such entry'),
      );

      const result = await adapterFor('routeros.firewall.filter.add').execute(addInput());

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_FAILED');
      }
    });

    it('treats a connection timeout as a temporary failure, so the engine can retry', async () => {
      vi.spyOn(fakeClient, 'createFilterRule').mockRejectedValueOnce(new Error('command timeout'));

      const result = await adapterFor('routeros.firewall.filter.add').execute(addInput());

      expect(result.outcome).to.equal('temporaryFailure');
    });

    it('propagates a trap raised during update', async () => {
      await seedRule();
      vi.spyOn(fakeClient, 'updateFilterRule').mockRejectedValueOnce(new Error('invalid chain value'));

      const result = await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          protocol: 'udp', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_FILTER_RULE');
      }
    });

    it('propagates a trap raised during remove, without masking it as a postcondition failure', async () => {
      await seedRule();
      vi.spyOn(fakeClient, 'removeFilterRule').mockRejectedValueOnce(new Error('no such item'));

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_FAILED');
      }
      expect(fakeClient.filterRules).to.have.length(1);
    });
  });

  /** UPDATE: preservacion de campos no solicitados y semantica de vaciado. */
  describe('update field semantics', () => {
    const REFERENCE = 'field-semantics';

    beforeEach(async () => {
      await fakeClient.createFilterRule({
        action: 'drop',
        chain: 'input',
        comment: `cuzonet:firewall-filter:${REFERENCE} texto original`,
        dstPort: '22',
        protocol: 'tcp',
        srcAddress: '192.168.1.0/24',
      });
    });

    it('preserves every field the request did not mention', async () => {
      const result = await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          action: 'accept', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]).to.include({
        action: 'accept',
        chain: 'input',
        dstPort: '22',
        protocol: 'tcp',
        srcAddress: '192.168.1.0/24',
      });
    });

    it('sends only the fields that actually differ from the observed rule', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateFilterRule');

      await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          action: 'accept',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: REFERENCE,
        }),
      );

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy.mock.calls[0]?.[1]).to.deep.equal({ action: 'accept' });
    });

    it('clearing the user comment leaves the bare ownership marker, never an empty comment', async () => {
      const result = await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          comment: '', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('success');
      // El marcador sobrevive: vaciar el comentario no puede costar la identidad de la regla.
      expect(fakeClient.filterRules[0]?.comment).to.equal(`cuzonet:firewall-filter:${REFERENCE}`);
      expect(fakeClient.filterRules[0]?.ruleReference).to.equal(REFERENCE);
    });

    it('rejects an empty srcAddress instead of treating it as a clear', async () => {
      const result = await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          routerId: 'router-1', ruleReference: REFERENCE, srcAddress: '',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      expect(fakeClient.filterRules[0]?.srcAddress).to.equal('192.168.1.0/24');
    });
  });

  /**
   * GUARDA DE OWNERSHIP. Hoy es inalcanzable por construccion: parseOwnership solo adjunta
   * `ruleReference` al estado `valid`, asi que la resolucion por referencia nunca devuelve
   * una regla ajena (certificado en "ownership reachability").
   *
   * La guarda existe como barrera de regresion. Estas pruebas fuerzan justo el escenario
   * contra el que protege —una resolucion que devuelve una regla no `valid`, como pasaria
   * si algun dia se buscara por chain+action, por coincidencia aproximada o por `.id`— y
   * comprueban que la regla ajena se rechaza en lugar de mutarse.
   */
  describe('ownership guard (defensive)', () => {
    const REFERENCE = 'guarded';

    /** Simula una resolucion aflojada que sí devuelve una regla con ownership no `valid`. */
    function resolveAs(status: 'foreign' | 'malformed' | 'unmanaged' | 'legacy'): void {
      vi.spyOn(fakeClient, 'findFilterRulesByReference').mockResolvedValue([
        {
          action: 'drop',
          bytes: 0,
          chain: 'input',
          disabled: false,
          dynamic: false,
          id: '*7',
          invalid: false,
          log: false,
          ownership: { status },
          packets: 0,
          physicalIndex: 0,
        },
      ]);
    }

    const STATUSES = ['foreign', 'malformed', 'unmanaged', 'legacy'] as const;

    const MUTATIONS = [
      ['update', 'updateFilterRule', { protocol: 'udp' }],
      ['move', 'moveFilterRule', { position: 0 }],
      ['enable', 'enableFilterRule', {}],
      ['disable', 'disableFilterRule', {}],
      ['remove', 'removeFilterRule', {}],
    ] as const;

    it.each(STATUSES)('refuses every mutation on a %s rule, without touching the router', async (status) => {
      for (const [operation, clientMethod, payload] of MUTATIONS) {
        resolveAs(status);
        const spy = vi.spyOn(fakeClient, clientMethod);
        const actionType = `routeros.firewall.filter.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome, `${status}/${operation}`).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, `${status}/${operation}`).to.equal(
            'ROUTEROS_FILTER_RULE_OWNERSHIP_VIOLATION',
          );
        }
        expect(spy, `${status}/${operation}`).not.toHaveBeenCalled();
        vi.restoreAllMocks();
      }
    });

    it.each(STATUSES)('refuses add when the reference resolves to a %s rule', async (status) => {
      resolveAs(status);
      const createSpy = vi.spyOn(fakeClient, 'createFilterRule');

      const result = await adapterFor('routeros.firewall.filter.add').execute(
        input('routeros.firewall.filter.add', {
          action: 'drop', chain: 'input', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_OWNERSHIP_VIOLATION');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reports the offending status and rule id in the message', async () => {
      resolveAs('foreign');

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain('foreign');
        expect(result.errorMessage).to.contain('*7');
        expect(result.errorMessage).to.contain(REFERENCE);
      }
    });

    it('legacy is refused too: adopting a pre-existing rule is an unmade product decision', async () => {
      resolveAs('legacy');

      const result = await adapterFor('routeros.firewall.filter.update').execute(
        input('routeros.firewall.filter.update', {
          protocol: 'udp', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_OWNERSHIP_VIOLATION');
      }
    });

    it('a valid rule passes the guard and the operation goes through as usual', async () => {
      await fakeClient.createFilterRule({
        action: 'drop', chain: 'input', comment: `cuzonet:firewall-filter:${REFERENCE}`,
      });

      const result = await adapterFor('routeros.firewall.filter.disable').execute(
        input('routeros.firewall.filter.disable', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.filterRules[0]?.disabled).to.equal(true);
    });

    it('ownership is checked before the dynamic guard: a foreign dynamic rule reports ownership', async () => {
      vi.spyOn(fakeClient, 'findFilterRulesByReference').mockResolvedValue([
        {
          action: 'drop',
          bytes: 0,
          chain: 'input',
          disabled: false,
          dynamic: true,
          id: '*8',
          invalid: false,
          log: false,
          ownership: { status: 'foreign' },
          packets: 0,
          physicalIndex: 0,
        },
      ]);

      const result = await adapterFor('routeros.firewall.filter.remove').execute(
        input('routeros.firewall.filter.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_FILTER_RULE_OWNERSHIP_VIOLATION');
      }
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.filter.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.filter.add',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-2',
      target: { id: 'target-1', type: 'Firewall Filter Rule' },
    };

    const result = await adapter.execute(badInput);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });

  it('rejects a payload that fails schema validation', async () => {
    const adapter = adapterFor('routeros.firewall.filter.add');

    const result = await adapter.execute(
      input('routeros.firewall.filter.add', {
        action: 'accept',
        chain: 'not-a-chain',
        routerId: 'router-1',
        ruleReference: 'allow-lan',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });

  describe('Pre-validation invariants (Phase 1)', () => {
    it('rejects if targetType is incorrect', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const badInput: ProvisioningActionInput = {
        actionType: 'routeros.firewall.filter.add',
        attemptNumber: 1,
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: 'key-1',
        inputSnapshotJson: JSON.stringify({ actionType: 'routeros.firewall.filter.add', routerId: 'r1', ruleReference: 'r1' }),
        requestId: 'req',
        target: { id: 'r1', type: 'RouterOS' }, // wrong type
      };

      const result = await adapter.execute(badInput);

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_TARGET_TYPE');
      }
      expect(fakeClient.filterRules).to.have.length(0); // Client not invoked
    });

    it('rejects if external actionType does not match internal actionType', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const badInput: ProvisioningActionInput = {
        actionType: 'routeros.firewall.filter.add',
        attemptNumber: 1,
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: 'key-1',
        inputSnapshotJson: JSON.stringify({ actionType: 'routeros.firewall.filter.remove', routerId: 'r1', ruleReference: 'r1' }),
        requestId: 'req',
        target: { id: 'r1', type: 'Firewall Filter Rule' },
      };

      const result = await adapter.execute(badInput);

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_ACTION_MISMATCH');
      }
    });

    it('rejects if external targetId does not match internal ruleReference', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const badInput: ProvisioningActionInput = {
        actionType: 'routeros.firewall.filter.add',
        attemptNumber: 1,
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: 'key-1',
        inputSnapshotJson: JSON.stringify({ actionType: 'routeros.firewall.filter.add', routerId: 'r1', ruleReference: 'rule-A' }),
        requestId: 'req',
        target: { id: 'rule-B', type: 'Firewall Filter Rule' },
      };

      const result = await adapter.execute(badInput);

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_TARGET_MISMATCH');
      }
    });

    it('rejects unknown properties (strict schema)', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: 'r1',
          unknownProp: 'invalid',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
    });

    it('rejects log, logPrefix, jumpTarget, dynamic, .id (strict schema)', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const fields = ['log', 'logPrefix', 'jumpTarget', 'dynamic', '.id'];
      for (const field of fields) {
        const result = await adapter.execute(
          input('routeros.firewall.filter.add', {
            action: 'accept',
            chain: 'input',
            routerId: 'router-1',
            ruleReference: 'r1',
            [field]: 'any',
          }),
        );
        expect(result.outcome).to.equal('permanentFailure');
      }
    });

    it('rejects IPv6 address', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: 'r1',
          srcAddress: '2001:db8::/32',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
    });

    it('rejects icmpv6 protocol', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          protocol: 'icmpv6',
          routerId: 'router-1',
          ruleReference: 'r1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
    });

    it('rejects inverted port ranges', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          dstPort: '2000-1000',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'r1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
    });

    it('rejects ports without a compatible protocol', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          dstPort: '80', // Protocol is missing
          routerId: 'router-1',
          ruleReference: 'r1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
    });

    it('rejects a composite comment that exceeds RouterOS limit', async () => {
      const adapter = adapterFor('routeros.firewall.filter.add');
      const reference = 'a'.repeat(128); // valid by itself
      // marker length = 24 + 128 = 152. RouterOS max = 255.
      // 255 - 152 = 103 chars left for comment. Space takes 1. We need 102 for comment.
      // Let's pass 150 chars for comment, which exceeds 255 total.
      const comment = 'b'.repeat(150);

      const result = await adapter.execute(
        input('routeros.firewall.filter.add', {
          action: 'accept',
          chain: 'input',
          comment,
          routerId: 'router-1',
          ruleReference: reference,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
    });
  });
});
