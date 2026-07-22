import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProvisioningActionInput } from '../../../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueProvisioningAdapter } from '../../../../../backend/infrastructure/provisioning/adapters/routeros-simple-queue-provisioning.adapter.js';
import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('RouterOsSimpleQueueProvisioningAdapter', () => {
  let clientFactory: RouterOsClientFactoryPort;
  let fakeClient: FakeRouterOsClient;
  let resolver: RouterConnectionResolverPort;
  let secretProvider: SecretProviderPort;
  let adapter: RouterOsSimpleQueueProvisioningAdapter;

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
    secretProvider = {
      getSecret: async () => 'secret',
    };
    clientFactory = {
      create: async () => fakeClient,
    };
    adapter = new RouterOsSimpleQueueProvisioningAdapter(
      'routeros.simple_queue.create',
      resolver,
      secretProvider,
      clientFactory,
    );
  });

  it('should create a simple queue and return success outcome', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        maxLimitDownload: '10M',
        maxLimitUpload: '5M',
        queueName: 'cliente-1',
        routerId: 'router-1',
        target: '192.168.1.10',
      }),
      requestId: 'req-1',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.queues.length).to.equal(1);
    expect(fakeClient.queues[0]?.name).to.equal('cliente-1');
    expect(fakeClient.queues[0]?.maxLimit).to.equal('5M/10M');
  });

  it('should treat a bare IPv4 target as equivalent to its RouterOS-normalized /32 form (idempotent, not a conflict)', async () => {
    fakeClient.queues.push({
      comment: 'Prueba E2E CuzoNet 008',
      disabled: false,
      id: '*1',
      maxLimit: '1M/2M',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32', // como lo devuelve RouterOS (siempre con mascara explicita)
    });

    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-008',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        maxLimitDownload: '2M',
        maxLimitUpload: '1M',
        queueName: 'TEST-CUZONET-008',
        routerId: 'router-1',
        target: '192.168.10.250', // como pudo haber llegado en la request original, sin mascara
      }),
      requestId: 'req-008',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.queues.length).to.equal(1); // no crea una segunda cola ni reporta conflicto
  });

  it('treats RouterOS numeric max-limit (bytes/segundo) as equivalent to abbreviated rates (caso real: 1000000/2000000 == 1M/2M)', async () => {
    fakeClient.queues.push({
      comment: 'Prueba E2E CuzoNet 008',
      disabled: false,
      id: '*B76',
      maxLimit: '1000000/2000000', // como lo devuelve RouterOS /queue/simple/print
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    });

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
        routerId: 'router-lab',
        target: '192.168.10.250/32',
      }),
      requestId: 'req-008',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.queues.length).to.equal(1); // idempotente: no crea una segunda cola ni reporta conflicto
  });

  it.each([
    ['1000K/1000K', '1M', '1M', '1000K == 1M'],
    ['1.5M/1.5M', '1500000', '1500000', '1.5M == 1500000'],
    ['1G/1G', '1000M', '1000M', '1G == 1000000000'],
  ])('normaliza tasas equivalentes (%s vs %s/%s) sin reportar conflicto: %s', async (actualMaxLimit, desiredUpload, desiredDownload) => {
    fakeClient.queues.push({
      disabled: false,
      id: '*1',
      maxLimit: actualMaxLimit,
      name: 'RATE-TEST',
      target: '10.0.0.1/32',
    });

    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: `key-rate-${actualMaxLimit}`,
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        maxLimitDownload: desiredDownload,
        maxLimitUpload: desiredUpload,
        queueName: 'RATE-TEST',
        routerId: 'router-lab',
        target: '10.0.0.1/32',
      }),
      requestId: `req-rate-${actualMaxLimit}`,
      target: { id: 'RATE-TEST', type: 'simple-queue' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('success');
    expect(fakeClient.queues.length).to.equal(1);
  });

  describe('routeros.simple_queue.update', () => {
    let updateAdapter: RouterOsSimpleQueueProvisioningAdapter;

    beforeEach(() => {
      updateAdapter = new RouterOsSimpleQueueProvisioningAdapter(
        'routeros.simple_queue.update',
        resolver,
        secretProvider,
        clientFactory,
      );
    });

    function updateInput(payload: Record<string, unknown>, requestId: string): ProvisioningActionInput {
      return {
        actionType: 'routeros.simple_queue.update',
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: requestId,
        inputSnapshotJson: JSON.stringify({
          actionType: 'routeros.simple_queue.update',
          routerId: 'router-lab',
          ...payload,
        }),
        requestId,
        target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
      };
    }

    it('returns ROUTEROS_SIMPLE_QUEUE_NOT_FOUND when the queue reference does not exist, and never calls updateSimpleQueue', async () => {
      const updateSpy = vi.spyOn(fakeClient, 'updateSimpleQueue');

      const result = await updateAdapter.execute(
        updateInput({ comment: 'nuevo comentario', queueReference: 'TEST-CUZONET-008' }, 'req-update-not-found'),
      );

      expect(result.outcome).to.equal('permanentFailure');
      if (result.outcome === 'permanentFailure') {
        expect(result.errorCode).to.equal('ROUTEROS_SIMPLE_QUEUE_NOT_FOUND');
      }
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('is idempotent (no /queue/simple/set) when the desired state already matches, including target/max-limit normalization', async () => {
      fakeClient.queues.push({
        comment: 'Prueba E2E CuzoNet 008',
        disabled: false,
        id: '*B76',
        maxLimit: '1000000/2000000', // como lo devuelve RouterOS (bytes/segundo)
        name: 'TEST-CUZONET-008',
        target: '192.168.10.250/32', // como lo devuelve RouterOS (con mascara)
      });
      const updateSpy = vi.spyOn(fakeClient, 'updateSimpleQueue');

      const result = await updateAdapter.execute(
        updateInput(
          {
            comment: 'Prueba E2E CuzoNet 008',
            maxLimitDownload: '2M',
            maxLimitUpload: '1M',
            queueReference: 'TEST-CUZONET-008',
            target: '192.168.10.250', // sin mascara: debe considerarse equivalente
          },
          'req-update-noop',
        ),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).not.toHaveBeenCalled();
      expect(fakeClient.queues[0]?.maxLimit).to.equal('1000000/2000000'); // sin cambios
    });

    it('calls updateSimpleQueue with only the fields that actually differ', async () => {
      fakeClient.queues.push({
        comment: 'Comentario viejo',
        disabled: false,
        id: '*B76',
        maxLimit: '1000000/2000000',
        name: 'TEST-CUZONET-008',
        target: '192.168.10.250/32',
      });
      const updateSpy = vi.spyOn(fakeClient, 'updateSimpleQueue');

      const result = await updateAdapter.execute(
        updateInput(
          {
            comment: 'Comentario nuevo',
            queueReference: 'TEST-CUZONET-008',
          },
          'req-update-real-change',
        ),
      );

      expect(result.outcome).to.equal('success');
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(
        { name: 'TEST-CUZONET-008' },
        { comment: 'Comentario nuevo' },
      );
      expect(fakeClient.queues[0]?.comment).to.equal('Comentario nuevo');
    });

    it('looks up the queue by name only, never by id, when checking existence', async () => {
      fakeClient.queues.push({
        comment: 'Comentario',
        disabled: false,
        id: '*B76',
        maxLimit: '1000000/2000000',
        name: 'TEST-CUZONET-008',
        target: '192.168.10.250/32',
      });
      const findSpy = vi.spyOn(fakeClient, 'findSimpleQueue');

      await updateAdapter.execute(
        updateInput({ comment: 'Comentario nuevo', queueReference: 'TEST-CUZONET-008' }, 'req-update-lookup'),
      );

      expect(findSpy).toHaveBeenCalledWith({ name: 'TEST-CUZONET-008' });
    });
  });

  describe('routeros.simple_queue.enable / disable / remove', () => {
    beforeEach(() => {
      fakeClient.queues.push({
        comment: 'Comentario',
        disabled: false,
        id: '*B76',
        maxLimit: '1000000/2000000',
        name: 'TEST-CUZONET-008',
        target: '192.168.10.250/32',
      });
    });

    function actionInput(actionType: string, requestId: string): ProvisioningActionInput {
      return {
        actionType,
        companyId: 'company-1',
        configurationReference: undefined,
        idempotencyKey: requestId,
        inputSnapshotJson: JSON.stringify({
          actionType,
          queueReference: 'TEST-CUZONET-008',
          routerId: 'router-lab',
        }),
        requestId,
        target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
      };
    }

    it('enable finds the queue by name only, never by id', async () => {
      const enableAdapter = new RouterOsSimpleQueueProvisioningAdapter(
        'routeros.simple_queue.enable',
        resolver,
        secretProvider,
        clientFactory,
      );
      const enableSpy = vi.spyOn(fakeClient, 'enableSimpleQueue');

      const result = await enableAdapter.execute(actionInput('routeros.simple_queue.enable', 'req-enable'));

      expect(result.outcome).to.equal('success');
      expect(enableSpy).toHaveBeenCalledWith({ name: 'TEST-CUZONET-008' });
      expect(fakeClient.queues[0]?.disabled).to.equal(false);
    });

    it('disable finds the queue by name only, never by id', async () => {
      const disableAdapter = new RouterOsSimpleQueueProvisioningAdapter(
        'routeros.simple_queue.disable',
        resolver,
        secretProvider,
        clientFactory,
      );
      const disableSpy = vi.spyOn(fakeClient, 'disableSimpleQueue');

      const result = await disableAdapter.execute(actionInput('routeros.simple_queue.disable', 'req-disable'));

      expect(result.outcome).to.equal('success');
      expect(disableSpy).toHaveBeenCalledWith({ name: 'TEST-CUZONET-008' });
      expect(fakeClient.queues[0]?.disabled).to.equal(true);
    });

    it('remove finds the queue by name only, never by id', async () => {
      const removeAdapter = new RouterOsSimpleQueueProvisioningAdapter(
        'routeros.simple_queue.remove',
        resolver,
        secretProvider,
        clientFactory,
      );
      const removeSpy = vi.spyOn(fakeClient, 'removeSimpleQueue');

      const result = await removeAdapter.execute(actionInput('routeros.simple_queue.remove', 'req-remove'));

      expect(result.outcome).to.equal('success');
      expect(removeSpy).toHaveBeenCalledWith({ name: 'TEST-CUZONET-008' });
      expect(fakeClient.queues).to.have.length(0);
    });
  });

  it('should reject invalid json payload', async () => {
    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-1',
      inputSnapshotJson: '{ invalid json }',
      requestId: 'req-2',
      target: { id: 'target-1', type: 'RouterOS' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).to.equal('permanentFailure');
    if (result.outcome === 'permanentFailure') {
      expect(result.errorCode).to.equal('ROUTEROS_INVALID_PAYLOAD');
    }
  });
});
