import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsNatProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-nat-provisioning.adapter.js';
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
    target: { id: 'target-1', type: 'RouterOS' },
  };
}

describe('RouterOsNatProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsNatProvisioningAdapter {
    return new RouterOsNatProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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
    it('creates a masquerade rule carrying the NAT comment marker and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.nat.add');
      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade',
          chain: 'srcnat',
          comment: 'Salida a Internet',
          outInterface: 'ether1-wan',
          routerId: 'router-1',
          ruleReference: 'wan-masquerade',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(1);
      expect(fakeClient.natRules[0]?.comment).to.equal('cuzonet:firewall-nat:wan-masquerade Salida a Internet');
      expect(fakeClient.natRules[0]?.action).to.equal('masquerade');
      expect(fakeClient.natRules[0]?.outInterface).to.equal('ether1-wan');
    });

    it('creates a dst-nat port-forward rule with toAddresses/toPorts', async () => {
      const adapter = adapterFor('routeros.firewall.nat.add');
      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'dst-nat',
          chain: 'dstnat',
          dstPort: '8080',
          protocol: 'tcp',
          routerId: 'router-1',
          ruleReference: 'forward-web',
          toAddresses: '192.168.1.10',
          toPorts: '80',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules[0]).to.include({ toAddresses: '192.168.1.10', toPorts: '80' });
    });

    it('rejects an action incompatible with the chain (masquerade on dstnat)', async () => {
      const adapter = adapterFor('routeros.firewall.nat.add');
      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade',
          chain: 'dstnat',
          routerId: 'router-1',
          ruleReference: 'bad-rule',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_NAT_RULE');
      }
      expect(fakeClient.natRules).to.have.length(0);
    });

    it('rejects a translating action without toAddresses', async () => {
      const adapter = adapterFor('routeros.firewall.nat.add');
      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'dst-nat',
          chain: 'dstnat',
          routerId: 'router-1',
          ruleReference: 'missing-target',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_NAT_RULE');
      }
    });

    it('places the new rule at the requested position', async () => {
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
      const adapter = adapterFor('routeros.firewall.nat.add');

      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade',
          chain: 'srcnat',
          position: 1,
          routerId: 'router-1',
          ruleReference: 'r0',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    it('is idempotent when an equivalent rule already exists', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
        outInterface: 'ether1-wan',
      });
      const adapter = adapterFor('routeros.firewall.nat.add');

      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade',
          chain: 'srcnat',
          outInterface: 'ether1-wan',
          routerId: 'router-1',
          ruleReference: 'wan-masquerade',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
        outInterface: 'ether1-wan',
      });
      const adapter = adapterFor('routeros.firewall.nat.add');

      const result = await adapter.execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade',
          chain: 'srcnat',
          outInterface: 'ether2-wan',
          routerId: 'router-1',
          ruleReference: 'wan-masquerade',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_CONFLICT');
      }
    });
  });

  describe('update', () => {
    it('updates only the changed fields and preserves the marker', async () => {
      await fakeClient.createNatRule({
        action: 'dst-nat',
        chain: 'dstnat',
        comment: 'cuzonet:firewall-nat:forward-web',
        toAddresses: '192.168.1.10',
      });
      const adapter = adapterFor('routeros.firewall.nat.update');

      const result = await adapter.execute(
        input('routeros.firewall.nat.update', {
          routerId: 'router-1',
          ruleReference: 'forward-web',
          toPorts: '80',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules[0]?.toPorts).to.equal('80');
      expect(fakeClient.natRules[0]?.toAddresses).to.equal('192.168.1.10');
    });

    it('rejects an update that would make the chain/action combination incoherent', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
      });
      const adapter = adapterFor('routeros.firewall.nat.update');

      const result = await adapter.execute(
        input('routeros.firewall.nat.update', {
          action: 'dst-nat',
          routerId: 'router-1',
          ruleReference: 'wan-masquerade',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_NAT_RULE');
      }
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
        outInterface: 'ether1-wan',
      });
      const adapter = adapterFor('routeros.firewall.nat.update');

      const result = await adapter.execute(
        input('routeros.firewall.nat.update', {
          outInterface: 'ether1-wan',
          routerId: 'router-1',
          ruleReference: 'wan-masquerade',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.nat.update');

      const result = await adapter.execute(
        input('routeros.firewall.nat.update', {
          routerId: 'router-1',
          ruleReference: 'missing',
          toPorts: '80',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_NOT_FOUND');
      }
    });
  });

  describe('move', () => {
    it('moves a rule to the requested position', async () => {
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r3' });
      const adapter = adapterFor('routeros.firewall.nat.move');

      const result = await adapter.execute(
        input('routeros.firewall.nat.move', { position: 0, routerId: 'router-1', ruleReference: 'r3' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r1' });
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment: 'cuzonet:firewall-nat:r2' });
      const adapter = adapterFor('routeros.firewall.nat.move');

      const result = await adapter.execute(
        input('routeros.firewall.nat.move', { position: 0, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.nat.move');

      const result = await adapter.execute(
        input('routeros.firewall.nat.move', { position: 0, routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled rule and returns success', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
        disabled: true,
      });
      const adapter = adapterFor('routeros.firewall.nat.enable');

      const result = await adapter.execute(
        input('routeros.firewall.nat.enable', { routerId: 'router-1', ruleReference: 'wan-masquerade' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules[0]?.disabled).to.equal(false);
    });
  });

  describe('disable', () => {
    it('disables an enabled rule and returns success', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
      });
      const adapter = adapterFor('routeros.firewall.nat.disable');

      const result = await adapter.execute(
        input('routeros.firewall.nat.disable', { routerId: 'router-1', ruleReference: 'wan-masquerade' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules[0]?.disabled).to.equal(true);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.nat.disable');

      const result = await adapter.execute(
        input('routeros.firewall.nat.disable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes an existing rule and returns success', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:wan-masquerade',
      });
      const adapter = adapterFor('routeros.firewall.nat.remove');

      const result = await adapter.execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: 'wan-masquerade' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.nat.remove');

      const result = await adapter.execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.nat.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.nat.add',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-2',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(badInput);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });

  it('rejects a payload that fails schema validation', async () => {
    const adapter = adapterFor('routeros.firewall.nat.add');

    const result = await adapter.execute(
      input('routeros.firewall.nat.add', {
        action: 'accept',
        chain: 'srcnat',
        routerId: 'router-1',
        ruleReference: 'bad-rule',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });

  /**
   * RouterOS no impone unicidad sobre el marcador del comentario: dos reglas NAT pueden
   * compartir referencia tras una duplicacion en WinBox o una importacion. Operar sobre la
   * primera dejaria la gemela viva — para un reenvio de puerto, lo contrario de lo pedido.
   */
  describe('ambiguous managed reference', () => {
    const REFERENCE = 'port-8080';
    const BASE = {
      action: 'dst-nat',
      chain: 'dstnat',
      comment: `cuzonet:firewall-nat:${REFERENCE}`,
      toAddresses: '192.168.1.50',
    } as const;

    beforeEach(async () => {
      await fakeClient.createNatRule(BASE);
      await fakeClient.createNatRule(BASE);
      expect(fakeClient.natRules).to.have.length(2);
    });

    const OPERATIONS = [
      ['add', 'createNatRule', { action: 'dst-nat', chain: 'dstnat', toAddresses: '192.168.1.50' }],
      ['update', 'updateNatRule', { toPorts: '8081' }],
      ['move', 'moveNatRule', { position: 0 }],
      ['enable', 'enableNatRule', {}],
      ['disable', 'disableNatRule', {}],
      ['remove', 'removeNatRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with AMBIGUOUS and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.nat.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_AMBIGUOUS');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.natRules).to.have.length(2);
    });

    it('names every candidate id so the operator can resolve it on the router', async () => {
      const ids = fakeClient.natRules.map((rule) => rule.id);

      const result = await adapterFor('routeros.firewall.nat.remove').execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain(REFERENCE);
        for (const id of ids) expect(result.errorMessage).to.contain(id);
      }
    });

    it('does not affect a different reference that resolves to a single rule', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:salida-wan',
      });

      const result = await adapterFor('routeros.firewall.nat.remove').execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: 'salida-wan' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(2);
    });
  });

  /**
   * Las reglas NAT dinamicas las genera RouterOS. El caso frecuente es UPnP, que crea
   * mapeos dst-nat a peticion de la LAN y los retira solo. Mutarlas informaria de un cambio
   * que no perdura.
   */
  describe('dynamic rule guard', () => {
    const REFERENCE = 'upnp-generated';

    beforeEach(async () => {
      await fakeClient.createNatRule({
        action: 'dst-nat',
        chain: 'dstnat',
        comment: `cuzonet:firewall-nat:${REFERENCE}`,
        toAddresses: '192.168.1.77',
      });
      const rule = fakeClient.natRules[0]!;
      fakeClient.natRules[0] = { ...rule, dynamic: true };
    });

    const OPERATIONS = [
      ['add', 'createNatRule', { action: 'dst-nat', chain: 'dstnat', toAddresses: '192.168.1.77' }],
      ['update', 'updateNatRule', { toPorts: '8081' }],
      ['move', 'moveNatRule', { position: 0 }],
      ['enable', 'enableNatRule', {}],
      ['disable', 'disableNatRule', {}],
      ['remove', 'removeNatRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with DYNAMIC and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.nat.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_DYNAMIC');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.natRules[0]?.dynamic).to.equal(true);
    });

    it('a dynamic rule can still be observed, only not mutated', async () => {
      const [observed] = await fakeClient.findNatRulesByReference(REFERENCE);

      expect(observed?.dynamic).to.equal(true);
      expect(observed?.ownership.ruleReference).to.equal(REFERENCE);
    });

    it('still reports NOT_FOUND, not DYNAMIC, when no rule carries the reference', async () => {
      const result = await adapterFor('routeros.firewall.nat.enable').execute(
        input('routeros.firewall.nat.enable', { routerId: 'router-1', ruleReference: 'no-existe' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_NOT_FOUND');
      }
    });

    it('leaves a static rule with a different reference fully operable', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade',
        chain: 'srcnat',
        comment: 'cuzonet:firewall-nat:static-one',
      });

      const result = await adapterFor('routeros.firewall.nat.disable').execute(
        input('routeros.firewall.nat.disable', { routerId: 'router-1', ruleReference: 'static-one' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules.find((r) => r.ruleReference === 'static-one')?.disabled).to.equal(true);
    });
  });

  /**
   * Postcondiciones. Solo `create` y `remove` releen: son las dos operaciones cuyo efecto
   * prometido (existe / ya no existe) el `!done` de RouterOS no garantiza por si mismo. En
   * update/enable/disable/move la confirmacion del router basta.
   */
  describe('postconditions', () => {
    const REFERENCE = 'port-8080';
    const addPayload = {
      action: 'dst-nat',
      chain: 'dstnat',
      routerId: 'router-1',
      ruleReference: REFERENCE,
      toAddresses: '192.168.1.50',
    };

    describe('create', () => {
      it('re-reads and succeeds when exactly one rule carries the reference', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findNatRulesByReference');

        const result = await adapterFor('routeros.firewall.nat.add').execute(
          input('routeros.firewall.nat.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        // Una resolucion previa y una relectura posterior.
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.natRules).to.have.length(1);
      });

      it('fails with POSTCONDITION_FAILED when the router accepted the add but persisted nothing', async () => {
        vi.spyOn(fakeClient, 'createNatRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.nat.add').execute(
          input('routeros.firewall.nat.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain(REFERENCE);
        }
      });

      it('fails with POSTCONDITION_FAILED when the add left a duplicate reference', async () => {
        const original = fakeClient.createNatRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createNatRule').mockImplementationOnce(async (rule) => {
          await original(rule);
          await original(rule); // el router duplica la regla
        });

        const result = await adapterFor('routeros.firewall.nat.add').execute(
          input('routeros.firewall.nat.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain('2');
        }
      });

      it('does not re-read when the create was an idempotent no-op', async () => {
        await fakeClient.createNatRule({
          action: 'dst-nat',
          chain: 'dstnat',
          comment: `cuzonet:firewall-nat:${REFERENCE}`,
          toAddresses: '192.168.1.50',
        });
        const findSpy = vi.spyOn(fakeClient, 'findNatRulesByReference');

        const result = await adapterFor('routeros.firewall.nat.add').execute(
          input('routeros.firewall.nat.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('remove', () => {
      beforeEach(async () => {
        await fakeClient.createNatRule({
          action: 'dst-nat',
          chain: 'dstnat',
          comment: `cuzonet:firewall-nat:${REFERENCE}`,
          toAddresses: '192.168.1.50',
        });
      });

      it('re-reads and succeeds once the rule is gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findNatRulesByReference');

        const result = await adapterFor('routeros.firewall.nat.remove').execute(
          input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.natRules).to.have.length(0);
      });

      it('fails with POSTCONDITION_FAILED when the rule survives the removal', async () => {
        vi.spyOn(fakeClient, 'removeNatRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.nat.remove').execute(
          input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_POSTCONDITION_FAILED');
        }
        expect(fakeClient.natRules).to.have.length(1);
      });

      it('does not re-read when the rule was already gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findNatRulesByReference');

        const result = await adapterFor('routeros.firewall.nat.remove').execute(
          input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: 'nunca-existio' }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('operations that deliberately do not re-read', () => {
      beforeEach(async () => {
        await fakeClient.createNatRule({
          action: 'dst-nat',
          chain: 'dstnat',
          comment: `cuzonet:firewall-nat:${REFERENCE}`,
          toAddresses: '192.168.1.50',
        });
      });

      const CASES = [
        ['update', { toPorts: '8081' }],
        ['enable', {}],
        ['disable', {}],
      ] as const;

      it.each(CASES)('%s resolves once and trusts the router confirmation', async (operation, payload) => {
        const findSpy = vi.spyOn(fakeClient, 'findNatRulesByReference');
        const actionType = `routeros.firewall.nat.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  /**
   * OWNERSHIP, capa 1: alcanzabilidad. `parseOwnership` solo adjunta `ruleReference` al
   * estado `valid`, y toda operacion resuelve por esa referencia, asi que foreign,
   * malformed y unmanaged son INALCANZABLES por construccion. Esa es la garantia real de
   * que CuzoNet no toca reglas NAT ajenas ni reclama ownership en silencio.
   */
  describe('ownership reachability', () => {
    const FOREIGN = 'cuzonet:firewall-filter:algo';
    const MALFORMED = 'cuzonet:firewall-nat:';
    const UNMANAGED = 'masquerade puesta a mano por el operador';

    it('classifies each comment shape as expected', async () => {
      for (const comment of ['cuzonet:firewall-nat:ok libre', FOREIGN, MALFORMED, UNMANAGED]) {
        await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment });
      }

      const observed = await fakeClient.listNatRules();

      expect(observed.map((rule) => rule.ownership.status)).to.deep.equal([
        'valid', 'foreign', 'malformed', 'unmanaged',
      ]);
      expect(observed[0]?.ownership.ruleReference).to.equal('ok');
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
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment });

      for (const [operation, payload] of [
        ['update', { toPorts: '8081' }],
        ['enable', {}],
        ['disable', {}],
        ['move', { position: 0 }],
      ] as const) {
        const actionType = `routeros.firewall.nat.${operation}`;
        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'cualquiera', ...payload }),
        );

        expect(result.outcome, operation).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, operation).to.equal('ROUTEROS_NAT_RULE_NOT_FOUND');
        }
      }
      expect(fakeClient.natRules).to.have.length(1);
      expect(fakeClient.natRules[0]?.comment).to.equal(comment);
    });

    it.each(NON_VALID)('remove never deletes a %s rule: it reports idempotent success instead', async (_status, comment) => {
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment });

      const result = await adapterFor('routeros.firewall.nat.remove').execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: 'cualquiera' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(1);
    });

    it.each(NON_VALID)('add does not adopt a %s rule: it creates a new managed one alongside', async (_status, comment) => {
      await fakeClient.createNatRule({ action: 'masquerade', chain: 'srcnat', comment });

      const result = await adapterFor('routeros.firewall.nat.add').execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade', chain: 'srcnat', routerId: 'router-1', ruleReference: 'nueva',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules).to.have.length(2);
      // El comentario ajeno no se reescribe: no se reclama ownership.
      expect(fakeClient.natRules[0]?.comment).to.equal(comment);
      expect(fakeClient.natRules[1]?.comment).to.equal('cuzonet:firewall-nat:nueva');
    });
  });

  /**
   * OWNERSHIP, capa 2: la guarda defensiva. Fuerza el escenario contra el que protege —una
   * resolucion aflojada que devuelve una regla no `valid`, como pasaria si algun dia se
   * buscara por chain+action o por `.id`— y comprueba que se rechaza en vez de mutarse.
   */
  describe('ownership guard (defensive)', () => {
    const REFERENCE = 'guarded';

    function resolveAs(status: 'foreign' | 'malformed' | 'unmanaged'): void {
      vi.spyOn(fakeClient, 'findNatRulesByReference').mockResolvedValue([
        {
          action: 'masquerade',
          bytes: 0,
          chain: 'srcnat',
          disabled: false,
          dynamic: false,
          id: '*7',
          invalid: false,
          ownership: { status },
          packets: 0,
          physicalIndex: 0,
        },
      ]);
    }

    const STATUSES = ['foreign', 'malformed', 'unmanaged'] as const;

    const MUTATIONS = [
      ['update', 'updateNatRule', { toPorts: '8081' }],
      ['move', 'moveNatRule', { position: 0 }],
      ['enable', 'enableNatRule', {}],
      ['disable', 'disableNatRule', {}],
      ['remove', 'removeNatRule', {}],
    ] as const;

    it.each(STATUSES)('refuses every mutation on a %s rule, without touching the router', async (status) => {
      for (const [operation, clientMethod, payload] of MUTATIONS) {
        resolveAs(status);
        const spy = vi.spyOn(fakeClient, clientMethod);
        const actionType = `routeros.firewall.nat.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome, `${status}/${operation}`).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, `${status}/${operation}`).to.equal(
            'ROUTEROS_NAT_RULE_OWNERSHIP_VIOLATION',
          );
        }
        expect(spy, `${status}/${operation}`).not.toHaveBeenCalled();
        vi.restoreAllMocks();
      }
    });

    it.each(STATUSES)('refuses add when the reference resolves to a %s rule', async (status) => {
      resolveAs(status);
      const createSpy = vi.spyOn(fakeClient, 'createNatRule');

      const result = await adapterFor('routeros.firewall.nat.add').execute(
        input('routeros.firewall.nat.add', {
          action: 'masquerade', chain: 'srcnat', routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_OWNERSHIP_VIOLATION');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reports the offending status and rule id in the message', async () => {
      resolveAs('foreign');

      const result = await adapterFor('routeros.firewall.nat.remove').execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain('foreign');
        expect(result.errorMessage).to.contain('*7');
        expect(result.errorMessage).to.contain(REFERENCE);
      }
    });

    it('ownership is checked before the dynamic guard: a foreign dynamic rule reports ownership', async () => {
      vi.spyOn(fakeClient, 'findNatRulesByReference').mockResolvedValue([
        {
          action: 'dst-nat',
          bytes: 0,
          chain: 'dstnat',
          disabled: false,
          dynamic: true,
          id: '*8',
          invalid: false,
          ownership: { status: 'foreign' },
          packets: 0,
          physicalIndex: 0,
        },
      ]);

      const result = await adapterFor('routeros.firewall.nat.remove').execute(
        input('routeros.firewall.nat.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_NAT_RULE_OWNERSHIP_VIOLATION');
      }
    });

    it('a valid rule passes the guard and the operation goes through as usual', async () => {
      await fakeClient.createNatRule({
        action: 'masquerade', chain: 'srcnat', comment: `cuzonet:firewall-nat:${REFERENCE}`,
      });

      const result = await adapterFor('routeros.firewall.nat.disable').execute(
        input('routeros.firewall.nat.disable', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.natRules[0]?.disabled).to.equal(true);
    });
  });
});
