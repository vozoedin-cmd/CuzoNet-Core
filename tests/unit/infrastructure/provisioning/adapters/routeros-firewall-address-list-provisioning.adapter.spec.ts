import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsFirewallAddressListProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-firewall-address-list-provisioning.adapter.js';
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

describe('RouterOsFirewallAddressListProvisioningAdapter', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;

  function adapterFor(actionType: string): RouterOsFirewallAddressListProvisioningAdapter {
    return new RouterOsFirewallAddressListProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
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
    it('creates an address list entry and returns success', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');
      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          comment: 'moroso',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries).to.have.length(1);
      expect(fakeClient.addressListEntries[0]?.address).to.equal('192.168.1.10');
      expect(fakeClient.addressListEntries[0]?.list).to.equal('blocked-ips');
      expect(fakeClient.addressListEntries[0]?.comment).to.equal('moroso');
    });

    it('never sends a timeout to the router, so the entry stays static', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');
      const createSpy = vi.spyOn(fakeClient, 'createAddressListEntry');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0]?.[0]).not.to.have.property('timeout');
      // Sin timeout, RouterOS deja la entrada estática: es lo que el Sync puede administrar.
      expect(fakeClient.addressListEntries[0]?.dynamic).to.equal(false);
    });

    it('rejects a payload carrying timeout instead of silently dropping it', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');
      const createSpy = vi.spyOn(fakeClient, 'createAddressListEntry');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
          timeout: '1d',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('accepts an IPv4 range', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '203.0.113.10-203.0.113.15',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries[0]?.address).to.equal('203.0.113.10-203.0.113.15');
    });

    it('rejects IPv6 and domain names before reaching the router', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');
      const createSpy = vi.spyOn(fakeClient, 'createAddressListEntry');

      for (const address of ['2001:db8::1', 'example.com']) {
        const result = await adapter.execute(
          input('routeros.firewall.address-list.add', {
            address,
            list: 'blocked-ips',
            routerId: 'router-1',
          }),
        );

        expect(result.outcome, address).to.equal('permanentFailure');
        if (result.outcome === 'permanentFailure') {
          expect(result.errorCode, address).to.equal('ROUTEROS_VALIDATION_ERROR');
        }
      }
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reports the address and list in the success metadata', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.add');
      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      if (result.outcome === 'success') {
        expect(result.metadata?.address).to.equal('192.168.1.10');
      }
    });

    it('is idempotent when an identical entry already exists', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries).to.have.length(1);
    });

    it('returns a conflict when an existing entry has different configuration', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', comment: 'a', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          comment: 'b',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_ADDRESS_LIST_CONFLICT');
      }
    });

    it('does not conflict when the same address exists in a different list', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'trusted-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries).to.have.length(2);
    });
  });

  describe('update', () => {
    it('updates only the changed fields and returns success', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.update');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.update', {
          address: '192.168.1.10',
          comment: 'moroso',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries[0]?.comment).to.equal('moroso');
    });

    it('is idempotent when nothing actually changes', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', comment: 'moroso', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.update');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.update', {
          address: '192.168.1.10',
          comment: 'moroso',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the entry does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.update');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.update', {
          address: '192.168.1.10',
          comment: 'moroso',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_ADDRESS_LIST_NOT_FOUND');
      }
    });
  });

  describe('enable', () => {
    it('enables a disabled entry and returns success', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', disabled: true, list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.enable');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.enable', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries[0]?.disabled).to.equal(false);
    });

    it('is idempotent when already enabled', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.enable');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.enable', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
    });

    it('fails permanently when the entry does not exist', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.enable');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.enable', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_ADDRESS_LIST_NOT_FOUND');
      }
    });
  });

  describe('disable', () => {
    it('disables an enabled entry and returns success', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.disable');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.disable', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries[0]?.disabled).to.equal(true);
    });

    it('is idempotent when already disabled', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', disabled: true, list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.disable');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.disable', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  describe('remove', () => {
    it('removes an existing entry and returns success', async () => {
      await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
      const adapter = adapterFor('routeros.firewall.address-list.remove');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.remove', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
      expect(fakeClient.addressListEntries).to.have.length(0);
    });

    it('is idempotent when the entry is already gone', async () => {
      const adapter = adapterFor('routeros.firewall.address-list.remove');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.remove', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('success');
    });
  });

  it('rejects an invalid JSON payload', async () => {
    const adapter = adapterFor('routeros.firewall.address-list.add');
    const badInput: ProvisioningActionInput = {
      actionType: 'routeros.firewall.address-list.add',
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
    const adapter = adapterFor('routeros.firewall.address-list.add');

    const result = await adapter.execute(
      input('routeros.firewall.address-list.add', {
        address: 'not-an-address',
        list: 'blocked-ips',
        routerId: 'router-1',
      }),
    );

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_VALIDATION_ERROR');
    }
  });

  /**
   * Mensajes textuales capturados de un hEX con RouterOS 7.21.4. El mapeo anterior buscaba
   * la palabra "address" junto a "invalid"/"no such"; ninguno de los tres traps la contiene,
   * asi que todos caian en ROUTEROS_EXECUTION_FAILED.
   */
  describe('RouterOS trap mapping', () => {
    const TRAPS: ReadonlyArray<readonly [string, string]> = [
      ['failure: already have such entry', 'ROUTEROS_ADDRESS_LIST_CONFLICT'],
      ['failure: 2001:db8::1 is not a valid dns name', 'ROUTEROS_INVALID_ADDRESS'],
      ['failure: cannot have disabled dynamic entry', 'ROUTEROS_ADDRESS_LIST_DYNAMIC'],
    ];

    it.each(TRAPS)('maps "%s" to %s', async (trapMessage, expectedCode) => {
      vi.spyOn(fakeClient, 'createAddressListEntry').mockRejectedValueOnce(new Error(trapMessage));
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal(expectedCode);
      }
    });

    it('still falls back to the generic mapping for an unrecognised failure', async () => {
      vi.spyOn(fakeClient, 'createAddressListEntry').mockRejectedValueOnce(new Error('failure: something else'));
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_EXECUTION_FAILED');
      }
    });

    it('keeps a connection timeout as a temporary failure', async () => {
      vi.spyOn(fakeClient, 'createAddressListEntry').mockRejectedValueOnce(new Error('command timeout'));
      const adapter = adapterFor('routeros.firewall.address-list.add');

      const result = await adapter.execute(
        input('routeros.firewall.address-list.add', {
          address: '192.168.1.10',
          list: 'blocked-ips',
          routerId: 'router-1',
        }),
      );

      expect(result.outcome).to.equal('temporaryFailure');
    });
  });
});
