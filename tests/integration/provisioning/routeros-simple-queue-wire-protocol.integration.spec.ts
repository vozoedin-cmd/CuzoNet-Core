import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvisioningActionInput } from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-simple-queue-provisioning.adapter.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';
import { createFakeRouterOsServer, type FakeRouterOsServer } from './routeros-wire-protocol-test-harness.js';

/**
 * Regression coverage for the "no such command" bug: `LibraryRouterOsClient`
 * used to call `client.print('/queue/simple/print', ...)`, but the underlying
 * `@sourceregistry/mikrotik-client` `print()` already appends `/print` itself,
 * producing the invalid path `/queue/simple/print/print` on the wire.
 *
 * This spins up a minimal RouterOS API TCP server (real socket, real binary
 * framing) to assert the exact command words sent, without needing a router.
 */

describe('LibraryRouterOsClient wire protocol (Simple Queue)', () => {
  let harness: FakeRouterOsServer;

  beforeEach(async () => {
    harness = createFakeRouterOsServer();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('findSimpleQueue envia /queue/simple/print (no /queue/simple/print/print)', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.findSimpleQueue({ name: 'TEST-CUZONET-007' });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/queue/simple/print');
  });

  it('listSimpleQueues envia /queue/simple/print (no /queue/simple/print/print)', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.listSimpleQueues();
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/queue/simple/print');
  });

  it('createSimpleQueue envia exactamente /queue/simple/add con los parametros efectivos', async () => {
    const client = await LibraryRouterOsClient.connect(harness.profile(), 'irrelevant');
    try {
      await client.createSimpleQueue({
        comment: 'Prueba E2E CuzoNet 007',
        maxLimit: '1M/2M',
        name: 'TEST-CUZONET-007',
        target: '192.168.10.250/32',
      });
    } finally {
      await client.close();
    }

    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.command).toBe('/queue/simple/add');
    expect(harness.captured[0]?.attributes).toEqual({
      comment: 'Prueba E2E CuzoNet 007',
      disabled: 'no',
      'max-limit': '1M/2M',
      name: 'TEST-CUZONET-007',
      target: '192.168.10.250/32',
    });
  });

  it('el nombre de accion interno routeros.simple_queue.create nunca se envia como comando RouterOS', async () => {
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'irrelevant' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    const adapter = new RouterOsSimpleQueueProvisioningAdapter(
      'routeros.simple_queue.create',
      resolver,
      secretProvider,
      clientFactory,
    );

    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-008',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        comment: 'Prueba E2E CuzoNet 008',
        maxLimitDownload: '2M',
        maxLimitUpload: '1M',
        queueName: 'TEST-CUZONET-008',
        routerId: 'router-01',
        target: '192.168.10.250/32',
      }),
      requestId: 'req-008',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print', '/queue/simple/add']);
    for (const entry of harness.captured) {
      expect(entry.command).not.toContain('routeros.simple_queue.create');
    }
    expect(harness.captured[1]?.attributes).toEqual({
      comment: 'Prueba E2E CuzoNet 008',
      disabled: 'no',
      'max-limit': '1M/2M',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    });
  });

  function updateAdapterAndDeps(): RouterOsSimpleQueueProvisioningAdapter {
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'irrelevant' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    return new RouterOsSimpleQueueProvisioningAdapter(
      'routeros.simple_queue.update',
      resolver,
      secretProvider,
      clientFactory,
    );
  }

  function updateInput(payload: Record<string, unknown>): ProvisioningActionInput {
    return {
      actionType: 'routeros.simple_queue.update',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-update',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.update',
        routerId: 'router-01',
        ...payload,
      }),
      requestId: 'req-update',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };
  }

  it('update: si la referencia no existe, solo envia /queue/simple/print (nunca /queue/simple/set)', async () => {
    const adapter = updateAdapterAndDeps();

    const result = await adapter.execute(
      updateInput({ comment: 'no importa', queueReference: 'TEST-CUZONET-008' }),
    );

    expect(result.outcome).toBe('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).toBe('ROUTEROS_SIMPLE_QUEUE_NOT_FOUND');
    }
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print']);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
  });

  it('update: si el estado deseado ya coincide (con normalizacion), solo envia /queue/simple/print (idempotente, sin /queue/simple/set)', async () => {
    harness.existingRecord = {
      '.id': '*B76',
      comment: 'Prueba E2E CuzoNet 008',
      disabled: 'no',
      'max-limit': '1000000/2000000', // como lo devuelve RouterOS
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32', // como lo devuelve RouterOS
    };
    const adapter = updateAdapterAndDeps();

    const result = await adapter.execute(
      updateInput({
        comment: 'Prueba E2E CuzoNet 008',
        maxLimitDownload: '2M',
        maxLimitUpload: '1M',
        queueReference: 'TEST-CUZONET-008',
        target: '192.168.10.250', // sin mascara: equivalente tras normalizar
      }),
    );

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print']);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
  });

  it('update: si algo difiere realmente, envia /queue/simple/print y luego /queue/simple/set con los atributos correctos', async () => {
    harness.existingRecord = {
      '.id': '*B76',
      comment: 'Comentario viejo',
      disabled: 'no',
      'max-limit': '1000000/2000000',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    };
    const adapter = updateAdapterAndDeps();

    const result = await adapter.execute(
      updateInput({ comment: 'Comentario nuevo', queueReference: 'TEST-CUZONET-008' }),
    );

    expect(result.outcome).toBe('success');
    // El adapter hace su propio findSimpleQueue (chequeo de no-op) y updateSimpleQueue()
    // resuelve el .id con otro findSimpleQueue interno antes de enviar /queue/simple/set.
    expect(harness.captured.map((entry) => entry.command)).toEqual([
      '/queue/simple/print',
      '/queue/simple/print',
      '/queue/simple/set',
    ]);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
    expect(harness.captured[1]?.queries).toEqual(['?name=TEST-CUZONET-008']);
    expect(harness.captured[2]?.attributes).toEqual({
      comment: 'Comentario nuevo',
      numbers: '*B76',
    });
  });

  function actionAdapter(actionType: string): RouterOsSimpleQueueProvisioningAdapter {
    const resolver: RouterConnectionResolverPort = { resolve: async () => harness.profile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'irrelevant' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    return new RouterOsSimpleQueueProvisioningAdapter(actionType, resolver, secretProvider, clientFactory);
  }

  function actionInput(actionType: string): ProvisioningActionInput {
    return {
      actionType,
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-action',
      inputSnapshotJson: JSON.stringify({
        actionType,
        queueReference: 'TEST-CUZONET-008',
        routerId: 'router-01',
      }),
      requestId: 'req-action',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };
  }

  it('enable: busca la cola con ?name=TEST-CUZONET-008, nunca con ?.id=TEST-CUZONET-008', async () => {
    harness.existingRecord = {
      '.id': '*B76',
      comment: 'Comentario',
      disabled: 'yes',
      'max-limit': '1000000/2000000',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    };
    const adapter = actionAdapter('routeros.simple_queue.enable');

    const result = await adapter.execute(actionInput('routeros.simple_queue.enable'));

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print', '/queue/simple/enable']);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
    expect(harness.captured[1]?.attributes).toEqual({ numbers: '*B76' });
  });

  it('disable: busca la cola con ?name=TEST-CUZONET-008, nunca con ?.id=TEST-CUZONET-008', async () => {
    harness.existingRecord = {
      '.id': '*B76',
      comment: 'Comentario',
      disabled: 'no',
      'max-limit': '1000000/2000000',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    };
    const adapter = actionAdapter('routeros.simple_queue.disable');

    const result = await adapter.execute(actionInput('routeros.simple_queue.disable'));

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print', '/queue/simple/disable']);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
    expect(harness.captured[1]?.attributes).toEqual({ numbers: '*B76' });
  });

  it('remove: busca la cola con ?name=TEST-CUZONET-008, nunca con ?.id=TEST-CUZONET-008', async () => {
    harness.existingRecord = {
      '.id': '*B76',
      comment: 'Comentario',
      disabled: 'no',
      'max-limit': '1000000/2000000',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    };
    const adapter = actionAdapter('routeros.simple_queue.remove');

    const result = await adapter.execute(actionInput('routeros.simple_queue.remove'));

    expect(result.outcome).toBe('success');
    expect(harness.captured.map((entry) => entry.command)).toEqual(['/queue/simple/print', '/queue/simple/remove']);
    expect(harness.captured[0]?.queries).toEqual(['?name=TEST-CUZONET-008']);
    expect(harness.captured[1]?.attributes).toEqual({ numbers: '*B76' });
  });
});
