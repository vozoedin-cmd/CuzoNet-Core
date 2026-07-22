import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvisioningActionInput } from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsPppoeProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-pppoe-provisioning.adapter.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * PPPoE Create against the real RouterOS API binary framing (same harness used
 * for Simple Queue), reusing exactly the same adapter/dispatcher/error-handling
 * infrastructure — `RouterOsProvisioningAdapterBase`, `resolveCredential()` via
 * `SecretProviderPort`, and `mapExecutionError()` for `RouterOsPppoeConflictError`.
 */

describe('LibraryRouterOsClient wire protocol (PPPoE)', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('findPppoeSecret envia /ppp/secret/print (no /ppp/secret/print/print)', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findPppoeSecret({ name: 'cliente-pppoe-001' });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/ppp/secret/print');
    expect(harness.captured[0]?.queries).toEqual(['?name=cliente-pppoe-001']);
  });

  it('createPppoeSecret envia exactamente /ppp/secret/add con los parametros efectivos', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createPppoeSecret({
        comment: 'Prueba E2E PPPoE 001',
        name: 'cliente-pppoe-001',
        password: 'clave-secreta',
        profile: 'perfil-residencial',
      });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/ppp/secret/add');
    expect(harness.captured[0]?.attributes).toEqual({
      comment: 'Prueba E2E PPPoE 001',
      name: 'cliente-pppoe-001',
      password: 'clave-secreta',
      profile: 'perfil-residencial',
      service: 'pppoe',
    });
  });

  it('el nombre de accion interno routeros.pppoe.create nunca se envia como comando RouterOS', async () => {
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'clave-secreta' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    const adapter = new RouterOsPppoeProvisioningAdapter(
      'routeros.pppoe.create',
      resolver,
      secretProvider,
      clientFactory,
    );

    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-pppoe-001',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        comment: 'Prueba E2E PPPoE 001',
        credentialReference: 'cred-cliente-pppoe-001',
        name: 'cliente-pppoe-001',
        profile: 'perfil-residencial',
        routerId: 'router-01',
      }),
      requestId: 'req-pppoe-001',
      target: { id: 'cliente-pppoe-001', type: 'pppoe-secret' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/ppp/secret/print', '/ppp/secret/add']);
    // El password SI debe viajar en los atributos del wire (asi crea RouterOS el secreto) —
    // lo que nunca debe pasar es que 'routeros.pppoe.create' se envie como si fuera un comando.
    for (const entry of harness.captured) {
      expect(entry.command).not.toContain('routeros.pppoe.create');
    }
    expect(input.inputSnapshotJson).not.toContain('clave-secreta'); // nunca persistida en el payload
    expect(harness.captured[1]?.attributes).toEqual({
      comment: 'Prueba E2E PPPoE 001',
      name: 'cliente-pppoe-001',
      password: 'clave-secreta',
      profile: 'perfil-residencial',
      service: 'pppoe',
    });
  });

  it('idempotente: si el secreto ya existe con la misma configuracion, no envia /ppp/secret/add', async () => {
    harness.existingRecord = {
      '.id': '*A1',
      comment: 'Prueba E2E PPPoE 001',
      disabled: 'no',
      name: 'cliente-pppoe-001',
      password: 'clave-secreta',
      profile: 'perfil-residencial',
      service: 'pppoe',
    };
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'clave-secreta' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    const adapter = new RouterOsPppoeProvisioningAdapter(
      'routeros.pppoe.create',
      resolver,
      secretProvider,
      clientFactory,
    );

    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-pppoe-001-retry',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-cliente-pppoe-001',
        name: 'cliente-pppoe-001',
        profile: 'perfil-residencial',
        routerId: 'router-01',
      }),
      requestId: 'req-pppoe-001-retry',
      target: { id: 'cliente-pppoe-001', type: 'pppoe-secret' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/ppp/secret/print']);
  });

  it('conflicto real: si el secreto ya existe con un perfil distinto, falla con ROUTEROS_PPPOE_CONFLICT sin enviar /ppp/secret/add', async () => {
    harness.existingRecord = {
      '.id': '*A1',
      comment: '',
      disabled: 'no',
      name: 'cliente-pppoe-001',
      password: 'clave-secreta',
      profile: 'perfil-otro',
      service: 'pppoe',
    };
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'clave-secreta' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    const adapter = new RouterOsPppoeProvisioningAdapter(
      'routeros.pppoe.create',
      resolver,
      secretProvider,
      clientFactory,
    );

    const input: ProvisioningActionInput = {
      actionType: 'routeros.pppoe.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-pppoe-001-conflict',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.pppoe.create',
        credentialReference: 'cred-cliente-pppoe-001',
        name: 'cliente-pppoe-001',
        profile: 'perfil-residencial',
        routerId: 'router-01',
      }),
      requestId: 'req-pppoe-001-conflict',
      target: { id: 'cliente-pppoe-001', type: 'pppoe-secret' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).toBe('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).toBe('ROUTEROS_PPPOE_CONFLICT');
    }
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/ppp/secret/print']);
  });
});
