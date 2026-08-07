import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  ObservedMangleRule,
  RouterOsClientFactoryPort,
} from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsMangleProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-mangle-provisioning.adapter.js';
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

describe('RouterOsMangleProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsMangleProvisioningAdapter {
    return new RouterOsMangleProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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
    it('creates a mark-connection rule carrying the Mangle comment marker and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          comment: 'Marca VoIP',
          newConnectionMark: 'voip-conn',
          protocol: 'udp',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.comment).to.equal('cuzonet:firewall-mangle:mark-voip-conn Marca VoIP');
      expect(fakeClient.mangleRules[0]?.newConnectionMark).to.equal('voip-conn');
    });

    it('creates a dependent mark-packet rule matching on an existing connectionMark', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet',
          chain: 'forward',
          connectionMark: 'voip-conn',
          newPacketMark: 'voip-packet',
          routerId: 'router-1',
          ruleReference: 'mark-voip-packet',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(2);
      expect(fakeClient.mangleRules[1]).to.include({ connectionMark: 'voip-conn', newPacketMark: 'voip-packet' });
    });

    it('rejects mark-connection without newConnectionMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it('rejects mark-packet without newPacketMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('rejects mark-routing without newRoutingMark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-routing',
          chain: 'prerouting',
          routerId: 'router-1',
          ruleReference: 'missing-mark',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('accepts passthrough without any mark', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.add');
      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'passthrough',
          chain: 'forward',
          routerId: 'router-1',
          ruleReference: 'noop-rule',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('places the new rule at the requested position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'passthrough',
          chain: 'forward',
          position: 1,
          routerId: 'router-1',
          ruleReference: 'r0',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r0', 'r2']);
    });

    /**
     * El GAP de la Fase 3, ya corregido. RouterOS 7.21.4 materializa `passthrough` siempre,
     * asi que un payload que lo omite significa "el default del router", no "sin valor".
     * `isEquivalent` comparaba `true === undefined` y declaraba conflicto donde habia
     * idempotencia: contra el router real, en CADA re-ejecucion de un `add` que no lo
     * declarara. Mientras el doble omitia el campo, la suite en verde no podia verlo.
     */
    it('is idempotent when the caller omits passthrough and the router materialised the default', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.passthrough).to.equal(true);
    });

    it('is idempotent when the caller states passthrough explicitly, matching the router default', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'voip-conn',
          passthrough: true,
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
    });

    it('returns a conflict when an existing rule has different configuration', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.add');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'other-mark',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_CONFLICT');
      }
    });
  });

  /**
   * La matriz completa de `passthrough` frente al estado observado. `passthrough` decide si
   * el paquete sigue evaluandose tras la marca, asi que confundir "omitido" con "false"
   * cambia que reglas posteriores se aplican: no es un detalle de comparacion.
   */
  describe('passthrough equivalence', () => {
    const REFERENCE = 'mark-voip-conn';

    async function seed(passthrough: boolean): Promise<void> {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: `cuzonet:firewall-mangle:${REFERENCE}`,
        newConnectionMark: 'voip-conn',
        passthrough,
      });
    }

    function addWith(passthrough?: boolean): Record<string, unknown> {
      return {
        action: 'mark-connection',
        chain: 'prerouting',
        newConnectionMark: 'voip-conn',
        ...(passthrough === undefined ? {} : { passthrough }),
        routerId: 'router-1',
        ruleReference: REFERENCE,
      };
    }

    const EQUIVALENT = [
      ['omitted', undefined, true],
      ['true', true, true],
      ['false', false, false],
    ] as const;

    it.each(EQUIVALENT)('payload %s vs observed %s: idempotent success', async (_label, payload, observed) => {
      await seed(observed);

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', addWith(payload)),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.passthrough).to.equal(observed);
    });

    const CONFLICTING = [
      ['false', false, true],
      ['true', true, false],
    ] as const;

    it.each(CONFLICTING)('payload %s vs observed %s: conflict', async (_label, payload, observed) => {
      await seed(observed);

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', addWith(payload)),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_CONFLICT');
      }
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.passthrough).to.equal(observed);
    });

    /** Un payload omitido no puede equivaler a `false`: el default observado es `true`. */
    it('payload omitted vs observed false: conflict', async () => {
      await seed(false);

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', addWith()),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_CONFLICT');
      }
    });

    it('a rule created without stating passthrough is created with the router default', async () => {
      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', addWith()),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.passthrough).to.equal(true);
    });
  });

  describe('update', () => {
    it('updates only the changed fields and preserves the marker', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-routing',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:route-isp-2',
        newRoutingMark: 'to-isp-2',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newRoutingMark: 'to-isp-3',
          routerId: 'router-1',
          ruleReference: 'route-isp-2',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.newRoutingMark).to.equal('to-isp-3');
    });

    it('rejects switching action to mark-packet without providing newPacketMark', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          action: 'mark-packet',
          routerId: 'router-1',
          ruleReference: 'noop-rule',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-connection',
        chain: 'prerouting',
        comment: 'cuzonet:firewall-mangle:mark-voip-conn',
        newConnectionMark: 'voip-conn',
      });
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'mark-voip-conn',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.update');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.update', {
          newConnectionMark: 'voip-conn',
          routerId: 'router-1',
          ruleReference: 'missing',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });

    /**
     * Un `false` explicito es una decision, no una ausencia. Si se descartara, apagar
     * `passthrough` seria imposible por esta via y la regla seguiria dejando pasar el
     * paquete a las reglas siguientes.
     */
    it.each([['passthrough'], ['disabled']] as const)('applies an explicit %s=false', async (field) => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:flags',
        disabled: true,
        newPacketMark: 'bulk',
        passthrough: true,
      });

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          [field]: false, routerId: 'router-1', ruleReference: 'flags',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.[field]).to.equal(false);
    });

    it.each([['passthrough'], ['disabled']] as const)('applies an explicit %s=true', async (field) => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:flags',
        disabled: false,
        newPacketMark: 'bulk',
        passthrough: false,
      });

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          [field]: true, routerId: 'router-1', ruleReference: 'flags',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.[field]).to.equal(true);
    });

    it('does not send an update when the requested passthrough already holds', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:flags',
        newPacketMark: 'bulk',
        passthrough: false,
      });
      const updateSpy = vi.spyOn(fakeClient, 'updateMangleRule');

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          passthrough: false, routerId: 'router-1', ruleReference: 'flags',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('mutates by .id, never by the managed reference', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:por-id',
        newPacketMark: 'bulk',
      });
      const expectedId = fakeClient.mangleRules[0]!.id;
      const updateSpy = vi.spyOn(fakeClient, 'updateMangleRule');

      await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          newPacketMark: 'otra', routerId: 'router-1', ruleReference: 'por-id',
        }),
      );

      expect(updateSpy).toHaveBeenCalledWith({ id: expectedId, kind: 'id' }, { newPacketMark: 'otra' });
    });
  });

  describe('move', () => {
    it('moves a rule to the requested position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r3' });
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'r3' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r3', 'r1', 'r2']);
    });

    it('is idempotent when the rule is already at the desired position', async () => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r1' });
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:r2' });
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'r1' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.map((r) => r.ruleReference)).to.deep.equal(['r1', 'r2']);
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.move');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.move', { position: 0, routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
        disabled: true,
      });
      const adapter = adapterFor('routeros.firewall.mangle.enable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.enable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.disabled).to.equal(false);
    });

    it('is idempotent when the rule is already enabled, without touching the router', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const enableSpy = vi.spyOn(fakeClient, 'enableMangleRule');

      const result = await adapterFor('routeros.firewall.mangle.enable').execute(
        input('routeros.firewall.mangle.enable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(enableSpy).not.toHaveBeenCalled();
    });

    it('fails permanently when the rule does not exist', async () => {
      const result = await adapterFor('routeros.firewall.mangle.enable').execute(
        input('routeros.firewall.mangle.enable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('disable', () => {
    it('disables an enabled rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.disable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.disabled).to.equal(true);
    });

    it('is idempotent when the rule is already disabled, without touching the router', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
        disabled: true,
      });
      const disableSpy = vi.spyOn(fakeClient, 'disableMangleRule');

      const result = await adapterFor('routeros.firewall.mangle.disable').execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(disableSpy).not.toHaveBeenCalled();
    });

    it('fails permanently when the rule does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.disable');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes an existing rule and returns success', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:noop-rule',
      });
      const adapter = adapterFor('routeros.firewall.mangle.remove');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'noop-rule' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it('is idempotent when the rule is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.mangle.remove');

      const result = await adapter.execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'missing' }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  /**
   * RouterOS no impone unicidad sobre el marcador del comentario: dos reglas Mangle pueden
   * compartir referencia tras una duplicacion en WinBox o una importacion. Operar sobre la
   * primera deja la gemela viva, y en Mangle eso significa que el trafico sigue marcado —o
   * marcado dos veces— mientras el sistema informa de que se hizo el cambio.
   */
  describe('ambiguous managed reference', () => {
    const REFERENCE = 'mark-voip-conn';
    const BASE = {
      action: 'mark-connection',
      chain: 'prerouting',
      comment: `cuzonet:firewall-mangle:${REFERENCE}`,
      newConnectionMark: 'voip-conn',
    } as const;

    beforeEach(async () => {
      await fakeClient.createMangleRule(BASE);
      await fakeClient.createMangleRule(BASE);
      expect(fakeClient.mangleRules).to.have.length(2);
    });

    const OPERATIONS = [
      ['add', 'createMangleRule', { action: 'mark-connection', chain: 'prerouting', newConnectionMark: 'voip-conn' }],
      ['update', 'updateMangleRule', { newConnectionMark: 'otra' }],
      ['move', 'moveMangleRule', { position: 0 }],
      ['enable', 'enableMangleRule', {}],
      ['disable', 'disableMangleRule', {}],
      ['remove', 'removeMangleRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with AMBIGUOUS and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.mangle.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_AMBIGUOUS');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.mangleRules).to.have.length(2);
    });

    it('names every candidate id so the operator can resolve it on the router', async () => {
      const ids = fakeClient.mangleRules.map((rule) => rule.id);

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain(REFERENCE);
        for (const id of ids) expect(result.errorMessage).to.contain(id);
      }
    });

    it('does not affect a different reference that resolves to a single rule', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:sola',
      });

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'sola' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(2);
    });
  });

  /**
   * Las reglas Mangle dinamicas las gobierna RouterOS: no persisten y desapareceran solas,
   * asi que mutarlas informaria de un cambio que no dura.
   */
  describe('dynamic rule guard', () => {
    const REFERENCE = 'dinamica';

    beforeEach(async () => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: `cuzonet:firewall-mangle:${REFERENCE}`,
        newPacketMark: 'bulk',
      });
      const rule = fakeClient.mangleRules[0]!;
      fakeClient.mangleRules[0] = { ...rule, dynamic: true };
    });

    const OPERATIONS = [
      ['add', 'createMangleRule', { action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk' }],
      ['update', 'updateMangleRule', { newPacketMark: 'otra' }],
      ['move', 'moveMangleRule', { position: 0 }],
      ['enable', 'enableMangleRule', {}],
      ['disable', 'disableMangleRule', {}],
      ['remove', 'removeMangleRule', {}],
    ] as const;

    it.each(OPERATIONS)('%s fails with DYNAMIC and never touches the router', async (operation, clientMethod, payload) => {
      const spy = vi.spyOn(fakeClient, clientMethod);
      const actionType = `routeros.firewall.mangle.${operation}`;

      const result = await adapterFor(actionType).execute(
        input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_DYNAMIC');
      }
      expect(spy).not.toHaveBeenCalled();
      expect(fakeClient.mangleRules[0]?.dynamic).to.equal(true);
    });

    it('a dynamic rule can still be observed, only not mutated', async () => {
      const [observed] = await fakeClient.findMangleRulesByReference(REFERENCE);

      expect(observed?.dynamic).to.equal(true);
      expect(observed?.ownership.ruleReference).to.equal(REFERENCE);
    });

    it('still reports NOT_FOUND, not DYNAMIC, when no rule carries the reference', async () => {
      const result = await adapterFor('routeros.firewall.mangle.enable').execute(
        input('routeros.firewall.mangle.enable', { routerId: 'router-1', ruleReference: 'no-existe' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });

    it('leaves a static rule with a different reference fully operable', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:estatica',
      });

      const result = await adapterFor('routeros.firewall.mangle.disable').execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: 'estatica' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules.find((r) => r.ruleReference === 'estatica')?.disabled).to.equal(true);
    });
  });

  /**
   * OWNERSHIP, capa 1: alcanzabilidad. `parseOwnership` solo adjunta `ruleReference` al
   * estado `valid`, y toda operacion resuelve por esa referencia, asi que foreign,
   * malformed y unmanaged son INALCANZABLES por construccion. Esa es la garantia real de
   * que CuzoNet no toca reglas de marcado ajenas ni reclama ownership en silencio.
   */
  describe('ownership reachability', () => {
    const FOREIGN = 'cuzonet:firewall-nat:algo';
    const MALFORMED = 'cuzonet:firewall-mangle:';
    const UNMANAGED = 'marcado puesto a mano por el operador';

    it('classifies each comment shape as expected', async () => {
      for (const comment of ['cuzonet:firewall-mangle:ok libre', FOREIGN, MALFORMED, UNMANAGED]) {
        await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment });
      }

      const observed = await fakeClient.listMangleRules();

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
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment });

      for (const [operation, payload] of [
        ['update', { newPacketMark: 'x', action: 'mark-packet' }],
        ['enable', {}],
        ['disable', {}],
        ['move', { position: 0 }],
      ] as const) {
        const actionType = `routeros.firewall.mangle.${operation}`;
        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: 'cualquiera', ...payload }),
        );

        expect(result.outcome, operation).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, operation).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
        }
      }
      expect(fakeClient.mangleRules).to.have.length(1);
      expect(fakeClient.mangleRules[0]?.comment).to.equal(comment);
    });

    it.each(NON_VALID)('remove never deletes a %s rule: it reports idempotent success instead', async (_status, comment) => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment });

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'cualquiera' }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(1);
    });

    it.each(NON_VALID)('add does not adopt a %s rule: it creates a new managed one alongside', async (_status, comment) => {
      await fakeClient.createMangleRule({ action: 'passthrough', chain: 'forward', comment });

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'passthrough', chain: 'forward', routerId: 'router-1', ruleReference: 'nueva',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules).to.have.length(2);
      // El comentario ajeno no se reescribe: no se reclama ownership.
      expect(fakeClient.mangleRules[0]?.comment).to.equal(comment);
      expect(fakeClient.mangleRules[1]?.comment).to.equal('cuzonet:firewall-mangle:nueva');
    });
  });

  /**
   * OWNERSHIP, capa 2: la guarda defensiva. Fuerza el escenario contra el que protege —una
   * resolucion aflojada que devuelve una regla no `valid`, como pasaria si algun dia se
   * buscara por `.id`, por chain+action o por posicion— y comprueba que se rechaza en vez
   * de mutarse.
   */
  describe('ownership guard (defensive)', () => {
    const REFERENCE = 'guarded';

    function resolveAs(status: 'foreign' | 'malformed' | 'unmanaged', overrides: Partial<ObservedMangleRule> = {}): void {
      vi.spyOn(fakeClient, 'findMangleRulesByReference').mockResolvedValue([
        {
          action: 'mark-packet',
          bytes: 0,
          chain: 'forward',
          disabled: false,
          dynamic: false,
          id: '*7',
          invalid: false,
          newPacketMark: 'bulk',
          ownership: { status },
          packets: 0,
          passthrough: true,
          physicalIndex: 0,
          ...overrides,
        },
      ]);
    }

    const STATUSES = ['foreign', 'malformed', 'unmanaged'] as const;

    const MUTATIONS = [
      ['update', 'updateMangleRule', { newPacketMark: 'otra' }],
      ['move', 'moveMangleRule', { position: 0 }],
      ['enable', 'enableMangleRule', {}],
      ['disable', 'disableMangleRule', {}],
      ['remove', 'removeMangleRule', {}],
    ] as const;

    it.each(STATUSES)('refuses every mutation on a %s rule, without touching the router', async (status) => {
      for (const [operation, clientMethod, payload] of MUTATIONS) {
        resolveAs(status);
        const spy = vi.spyOn(fakeClient, clientMethod);
        const actionType = `routeros.firewall.mangle.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome, `${status}/${operation}`).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, `${status}/${operation}`).to.equal(
            'ROUTEROS_MANGLE_RULE_OWNERSHIP_VIOLATION',
          );
        }
        expect(spy, `${status}/${operation}`).not.toHaveBeenCalled();
        vi.restoreAllMocks();
      }
    });

    it.each(STATUSES)('refuses add when the reference resolves to a %s rule', async (status) => {
      resolveAs(status);
      const createSpy = vi.spyOn(fakeClient, 'createMangleRule');

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk',
          routerId: 'router-1', ruleReference: REFERENCE,
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_OWNERSHIP_VIOLATION');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reports the offending status and rule id in the message', async () => {
      resolveAs('foreign');

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      if (result.outcome === 'permanentFailure') {
        expect(result.errorMessage).to.contain('foreign');
        expect(result.errorMessage).to.contain('*7');
        expect(result.errorMessage).to.contain(REFERENCE);
      }
    });

    it('ownership is checked before the dynamic guard: a foreign dynamic rule reports ownership', async () => {
      resolveAs('foreign', { dynamic: true });

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_OWNERSHIP_VIOLATION');
      }
    });

    it('a valid rule passes the guard and the operation goes through as usual', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough', chain: 'forward', comment: `cuzonet:firewall-mangle:${REFERENCE}`,
      });

      const result = await adapterFor('routeros.firewall.mangle.disable').execute(
        input('routeros.firewall.mangle.disable', { routerId: 'router-1', ruleReference: REFERENCE }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.disabled).to.equal(true);
    });
  });

  /**
   * Postcondiciones. Solo `create` y `remove` releen: son las dos operaciones cuyo efecto
   * prometido (existe / ya no existe) el `!done` de RouterOS no garantiza por si mismo. En
   * update/enable/disable/move la confirmacion del router basta.
   */
  describe('postconditions', () => {
    const REFERENCE = 'mark-voip-conn';
    const addPayload = {
      action: 'mark-connection',
      chain: 'prerouting',
      newConnectionMark: 'voip-conn',
      routerId: 'router-1',
      ruleReference: REFERENCE,
    };

    describe('create', () => {
      it('re-reads and succeeds when exactly one equivalent rule carries the reference', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findMangleRulesByReference');

        const result = await adapterFor('routeros.firewall.mangle.add').execute(
          input('routeros.firewall.mangle.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        // Una resolucion previa y una relectura posterior.
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.mangleRules).to.have.length(1);
      });

      it('fails with POSTCONDITION_FAILED when the router accepted the add but persisted nothing', async () => {
        vi.spyOn(fakeClient, 'createMangleRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.mangle.add').execute(
          input('routeros.firewall.mangle.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain(REFERENCE);
        }
      });

      it('fails with POSTCONDITION_FAILED when the add left a duplicate reference', async () => {
        const original = fakeClient.createMangleRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createMangleRule').mockImplementationOnce(async (rule) => {
          await original(rule);
          await original(rule); // el router duplica la regla
        });

        const result = await adapterFor('routeros.firewall.mangle.add').execute(
          input('routeros.firewall.mangle.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_POSTCONDITION_FAILED');
          expect(result.errorMessage).to.contain('2');
        }
      });

      /**
       * Propia de Mangle: la regla existe, es unica, y aun asi no es la pedida. Marcaria un
       * trafico distinto del solicitado mientras el sistema informa exito.
       */
      it('fails with POSTCONDITION_FAILED when the created rule does not match what was asked', async () => {
        const original = fakeClient.createMangleRule.bind(fakeClient);
        vi.spyOn(fakeClient, 'createMangleRule').mockImplementationOnce(async (rule) => {
          await original({ ...rule, passthrough: false });
        });

        const result = await adapterFor('routeros.firewall.mangle.add').execute(
          input('routeros.firewall.mangle.add', addPayload),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_POSTCONDITION_FAILED');
        }
        expect(fakeClient.mangleRules).to.have.length(1);
      });

      it('does not re-read when the create was an idempotent no-op', async () => {
        await fakeClient.createMangleRule({
          action: 'mark-connection',
          chain: 'prerouting',
          comment: `cuzonet:firewall-mangle:${REFERENCE}`,
          newConnectionMark: 'voip-conn',
        });
        const findSpy = vi.spyOn(fakeClient, 'findMangleRulesByReference');

        const result = await adapterFor('routeros.firewall.mangle.add').execute(
          input('routeros.firewall.mangle.add', addPayload),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('remove', () => {
      beforeEach(async () => {
        await fakeClient.createMangleRule({
          action: 'mark-connection',
          chain: 'prerouting',
          comment: `cuzonet:firewall-mangle:${REFERENCE}`,
          newConnectionMark: 'voip-conn',
        });
      });

      it('re-reads and succeeds once the rule is gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findMangleRulesByReference');

        const result = await adapterFor('routeros.firewall.mangle.remove').execute(
          input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(2);
        expect(fakeClient.mangleRules).to.have.length(0);
      });

      it('fails with POSTCONDITION_FAILED when the rule survives the removal', async () => {
        vi.spyOn(fakeClient, 'removeMangleRule').mockResolvedValueOnce(undefined);

        const result = await adapterFor('routeros.firewall.mangle.remove').execute(
          input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: REFERENCE }),
        );

        expect(result.outcome).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_POSTCONDITION_FAILED');
        }
        expect(fakeClient.mangleRules).to.have.length(1);
      });

      it('does not re-read when the rule was already gone', async () => {
        const findSpy = vi.spyOn(fakeClient, 'findMangleRulesByReference');

        const result = await adapterFor('routeros.firewall.mangle.remove').execute(
          input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'nunca-existio' }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('operations that deliberately do not re-read', () => {
      beforeEach(async () => {
        await fakeClient.createMangleRule({
          action: 'mark-connection',
          chain: 'prerouting',
          comment: `cuzonet:firewall-mangle:${REFERENCE}`,
          newConnectionMark: 'voip-conn',
        });
      });

      it.each([
        ['update', { newConnectionMark: 'otra' }],
        ['enable', {}],
        ['disable', {}],
      ] as const)('%s resolves once and trusts the router confirmation', async (operation, payload) => {
        const findSpy = vi.spyOn(fakeClient, 'findMangleRulesByReference');
        const actionType = `routeros.firewall.mangle.${operation}`;

        const result = await adapterFor(actionType).execute(
          input(actionType, { routerId: 'router-1', ruleReference: REFERENCE, ...payload }),
        );

        expect(result.outcome).to.equal('success');
        expect(findSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  /**
   * Coherencia accion/marca. Es la regla de dominio propia de Mangle y no se debilita: una
   * regla `mark-packet` sin `new-packet-mark` la acepta el router y no marca nada, de modo
   * que el fallo aparece mucho despues, como trafico sin encolar.
   */
  describe('action/mark coherence', () => {
    const ACTIONS = [
      ['mark-connection', 'newConnectionMark', 'prerouting'],
      ['mark-packet', 'newPacketMark', 'forward'],
      ['mark-routing', 'newRoutingMark', 'prerouting'],
    ] as const;

    it.each(ACTIONS)('add rejects %s without %s', async (action, _field, chain) => {
      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action, chain, routerId: 'router-1', ruleReference: 'sin-marca',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it.each(ACTIONS)('add rejects %s when %s is an empty string', async (action, field, chain) => {
      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action, chain, [field]: '', routerId: 'router-1', ruleReference: 'marca-vacia',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      expect(fakeClient.mangleRules).to.have.length(0);
    });

    it.each(ACTIONS)('update rejects switching to %s without providing %s', async (action, _field, _chain) => {
      await fakeClient.createMangleRule({
        action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:noop',
      });

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          action, routerId: 'router-1', ruleReference: 'noop',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
      }
      expect(fakeClient.mangleRules[0]?.action).to.equal('passthrough');
    });

    it.each(ACTIONS)('update accepts switching to %s when %s comes with it', async (action, field, _chain) => {
      await fakeClient.createMangleRule({
        action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:noop',
      });

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          action, [field]: 'nueva-marca', routerId: 'router-1', ruleReference: 'noop',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.action).to.equal(action);
      expect(fakeClient.mangleRules[0]?.[field]).to.equal('nueva-marca');
    });

    /** La marca ya presente en la regla satisface la coherencia sin reenviarla. */
    it('update keeps the existing mark when only the action is restated', async () => {
      await fakeClient.createMangleRule({
        action: 'mark-packet',
        chain: 'forward',
        comment: 'cuzonet:firewall-mangle:ya-marcada',
        newPacketMark: 'bulk',
      });

      const result = await adapterFor('routeros.firewall.mangle.update').execute(
        input('routeros.firewall.mangle.update', {
          action: 'mark-packet', routerId: 'router-1', ruleReference: 'ya-marcada',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.mangleRules[0]?.newPacketMark).to.equal('bulk');
    });
  });

  /**
   * Mapeo de `!trap`. Los mensajes son exactamente los certificados en la Fase 3 contra el
   * framing binario real; el mapeo previo exigia la palabra "invalid", que RouterOS casi
   * nunca usa, y mandaba estos rechazos al fallback generico.
   */
  describe('RouterOS trap mapping', () => {
    function trapOnCreate(message: string): void {
      vi.spyOn(fakeClient, 'createMangleRule').mockRejectedValueOnce(
        Object.assign(new Error(message), { name: 'RouterOSTrapError' }),
      );
    }

    const VALIDATION_TRAPS = [
      'input does not match any value of action',
      'input does not match any value of protocol',
      'input does not match any value of in-interface',
      'input does not match any value of new-routing-mark',
      'invalid value for argument new-packet-mark',
      'unknown parameter foo',
      'failure: chain does not exist',
    ];

    it.each(VALIDATION_TRAPS)('maps "%s" to ROUTEROS_INVALID_MANGLE_RULE', async (message) => {
      trapOnCreate(message);

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk',
          routerId: 'router-1', ruleReference: 'trap',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_INVALID_MANGLE_RULE');
        expect(result.errorMessage).to.equal(message);
      }
    });

    it('maps "no such item" to ROUTEROS_MANGLE_RULE_NOT_FOUND', async () => {
      await fakeClient.createMangleRule({
        action: 'passthrough', chain: 'forward', comment: 'cuzonet:firewall-mangle:vanished',
      });
      vi.spyOn(fakeClient, 'removeMangleRule').mockRejectedValueOnce(new Error('no such item'));

      const result = await adapterFor('routeros.firewall.mangle.remove').execute(
        input('routeros.firewall.mangle.remove', { routerId: 'router-1', ruleReference: 'vanished' }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_NOT_FOUND');
      }
    });

    it('maps "failure: already have such entry" to ROUTEROS_MANGLE_RULE_CONFLICT', async () => {
      trapOnCreate('failure: already have such entry');

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk',
          routerId: 'router-1', ruleReference: 'dup',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_MANGLE_RULE_CONFLICT');
      }
    });

    /** Un `failure` pelado no dice nada: se reporta como fallo de ejecucion, sin inventar causa. */
    it('leaves a bare "failure" on the generic fallback', async () => {
      trapOnCreate('failure');

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk',
          routerId: 'router-1', ruleReference: 'raro',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_FAILED');
      }
    });

    it('still classifies a timeout as a temporary failure', async () => {
      trapOnCreate('command timeout after 2000ms');

      const result = await adapterFor('routeros.firewall.mangle.add').execute(
        input('routeros.firewall.mangle.add', {
          action: 'mark-packet', chain: 'forward', newPacketMark: 'bulk',
          routerId: 'router-1', ruleReference: 'lento',
        }),
      );

      expect(result.outcome).to.equal('temporaryFailure');
      if (result.outcome === 'temporaryFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_TIMEOUT');
      }
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.mangle.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.mangle.add',
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
    const adapter = adapterFor('routeros.firewall.mangle.add');

    const result = await adapter.execute(
      input('routeros.firewall.mangle.add', {
        action: 'jump',
        chain: 'forward',
        routerId: 'router-1',
        ruleReference: 'bad-rule',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });
});
