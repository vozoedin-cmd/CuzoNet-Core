import { describe, it, expect, beforeEach } from 'vitest';

import type { RouterConnectionResolverPort } from '../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { FakeRouterOsClient } from '../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';
import { RouterOsActualStateReader } from '../../../../backend/infrastructure/synchronization/routeros-actual-state.reader.js';

describe('RouterOsActualStateReader', () => {
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let clientFactory: RouterOsClientFactoryPort;
  let reader: RouterOsActualStateReader;

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
    reader = new RouterOsActualStateReader(resolver, secretProvider, clientFactory);
  });

  it('normalizes simple queues by name', async () => {
    await fakeClient.createSimpleQueue({ comment: 'x', maxLimit: '5M/20M', name: 'queue-1', target: '192.168.1.10/32' });

    const records = await reader.readActualState('company-1', 'router-1', 'simple-queue');

    expect(records).to.deep.equal([
      { disabled: false, fields: { comment: 'x', maxLimit: '5M/20M', target: '192.168.1.10/32' }, reference: 'queue-1' },
    ]);
  });

  it('normalizes address-list entries with a compound list:address reference', async () => {
    await fakeClient.createAddressListEntry({ address: '192.168.1.10', comment: 'moroso', list: 'blocked-ips' });

    const records = await reader.readActualState('company-1', 'router-1', 'address-list-entry');

    // `timeout` quedó fuera del contrato: identifica entradas dinámicas y efímeras, y el
    // router lo devuelve como cuenta regresiva, así que nunca fue comparable.
    expect(records).to.deep.equal([
      { disabled: false, fields: { comment: 'moroso' }, reference: 'blocked-ips:192.168.1.10' },
    ]);
  });

  /**
   * Las entradas dinámicas las gobierna RouterOS y desaparecen solas. Incluirlas las
   * mostraría como `unexpected`, sugiriendo una divergencia inexistente y contradiciendo
   * al aprovisionamiento, que ya se niega a tocarlas.
   */
  it('excludes dynamic address-list entries from the actual state', async () => {
    await fakeClient.createAddressListEntry({ address: '192.168.1.10', list: 'blocked-ips' });
    fakeClient.addressListEntries.push({
      address: '192.168.1.198',
      disabled: false,
      dynamic: true,
      id: '*10',
      list: 'blocked-ips',
    });

    const records = await reader.readActualState('company-1', 'router-1', 'address-list-entry');

    expect(records.map((record) => record.reference)).to.deep.equal(['blocked-ips:192.168.1.10']);
  });

  it('returns nothing when every address-list entry on the router is dynamic', async () => {
    fakeClient.addressListEntries.push(
      { address: '192.168.1.198', disabled: false, dynamic: true, id: '*10', list: 'blocked-ips' },
      { address: '172.66.147.243', disabled: false, dynamic: true, id: '*11', list: 'blocked-ips' },
    );

    const records = await reader.readActualState('company-1', 'router-1', 'address-list-entry');

    expect(records).to.deep.equal([]);
  });

  it('normalizes filter rules by their comment marker reference', async () => {
    await fakeClient.createFilterRule({
      action: 'drop',
      chain: 'input',
      comment: 'cuzonet:firewall-filter:block-ssh-wan',
      protocol: 'tcp',
    });

    const records = await reader.readActualState('company-1', 'router-1', 'filter-rule');

    expect(records).to.have.length(1);
    expect(records[0]?.reference).to.equal('block-ssh-wan');
    expect(records[0]?.fields).to.include({ action: 'drop', chain: 'input', protocol: 'tcp' });
  });

  it('assigns a synthetic "unmanaged:<id>" reference to rules without a CuzoNet marker', async () => {
    await fakeClient.createFilterRule({ action: 'accept', chain: 'forward', comment: 'manually added by an operator' });

    const records = await reader.readActualState('company-1', 'router-1', 'filter-rule');

    expect(records).to.have.length(1);
    expect(records[0]?.reference).to.match(/^unmanaged:\*\d+$/);
  });

  it('normalizes NAT rules including toAddresses/toPorts', async () => {
    await fakeClient.createNatRule({
      action: 'dst-nat',
      chain: 'dstnat',
      comment: 'cuzonet:firewall-nat:forward-web',
      toAddresses: '192.168.1.10',
      toPorts: '80',
    });

    const records = await reader.readActualState('company-1', 'router-1', 'nat-rule');

    expect(records[0]?.fields).to.include({ toAddresses: '192.168.1.10', toPorts: '80' });
  });

  it('normalizes Mangle rules including marks and passthrough', async () => {
    await fakeClient.createMangleRule({
      action: 'mark-connection',
      chain: 'prerouting',
      comment: 'cuzonet:firewall-mangle:mark-voip',
      newConnectionMark: 'voip-conn',
      passthrough: true,
    });

    const records = await reader.readActualState('company-1', 'router-1', 'mangle-rule');

    expect(records[0]?.fields).to.include({ newConnectionMark: 'voip-conn', passthrough: 'true' });
  });

  it('closes the client after reading, even across resource types', async () => {
    await reader.readActualState('company-1', 'router-1', 'simple-queue');
    expect(fakeClient.closed).to.equal(true);
  });

  it('throws RouterConnectionError when the router cannot be resolved', async () => {
    resolver.resolve = async () => null;
    reader = new RouterOsActualStateReader(resolver, secretProvider, clientFactory);

    await expect(reader.readActualState('company-1', 'missing-router', 'simple-queue')).rejects.toThrow(
      /Router no encontrado/,
    );
  });

  it('throws RouterConnectionError when the secret cannot be resolved', async () => {
    secretProvider.getSecret = async () => null;
    reader = new RouterOsActualStateReader(resolver, secretProvider, clientFactory);

    await expect(reader.readActualState('company-1', 'router-1', 'simple-queue')).rejects.toThrow(/Secreto no encontrado/);
  });
});
