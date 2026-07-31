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
    clientFactory = { create: async () => fakeClient };
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
