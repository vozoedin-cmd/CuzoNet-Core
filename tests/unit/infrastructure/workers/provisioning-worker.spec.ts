import { describe, expect, it } from 'vitest';

import { ProvisioningOperation } from '../../../../backend/domain/provisioning/provisioning-operation.js';
import { OperationId } from '../../../../backend/domain/provisioning/value-objects/operation-id.js';
import { OperationType } from '../../../../backend/domain/provisioning/value-objects/operation-type.js';
import { ProvisionRequest } from '../../../../backend/domain/provisioning/value-objects/provision-request.js';
import type { ProvisioningExecutionCommand } from '../../../../backend/application/ports/provisioning/provisioning-executor.port.js';
import type {
  WorkLease,
  WorkerExecutionContext,
} from '../../../../backend/infrastructure/workers/worker-contracts.js';
import { ProvisioningWorker } from '../../../../backend/infrastructure/workers/provisioning-worker.js';
import { WorkerRole } from '../../../../backend/infrastructure/workers/worker-role.js';

const companyId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10';
const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30';
const routerId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';
const operationId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50';

describe('ProvisioningWorker', () => {
  it('entrega uploadKbps y downloadKbps resueltos al ExecutionCommand', async () => {
    const operation = ProvisioningOperation.create({
      causationId: operationId,
      companyId,
      correlationId: operationId,
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      eventId: operationId,
      id: OperationId.create(operationId),
      idempotencyKey: 'provision-service',
      maxAttempts: 3,
      provisionRequest: ProvisionRequest.create({ routerId }),
      requestedBy: 'test',
      serviceId,
      type: OperationType.provision(),
    });
    operation.start(new Date('2026-07-13T12:00:01.000Z'));
    let received: ProvisioningExecutionCommand | undefined;
    const worker = new ProvisioningWorker({
      claim: { execute: () => Promise.resolve(operation) } as never,
      complete: { execute: () => Promise.resolve() } as never,
      executor: {
        execute: (command) => {
          received = command;
          return Promise.resolve({ outcome: 'succeeded' });
        },
      },
      fail: { execute: () => Promise.resolve() } as never,
      profiles: {
        findByPlanVersionId: () =>
          Promise.resolve({
            planVersionId,
            values: { downloadKbps: '20000', uploadKbps: 5000 },
          }),
      },
      retry: { execute: () => Promise.resolve() } as never,
      services: {
        findById: () =>
          Promise.resolve({
            companyId,
            lifecycleStatus: 'pending',
            planVersionId,
            serviceId,
            serviceType: 'simple_queue',
          }),
      },
    });

    await expect(worker.runOnce(executionContext())).resolves.toEqual({ outcome: 'processed' });
    expect(received).toMatchObject({
      companyId,
      downloadKbps: 20_000,
      operationId,
      serviceId,
      uploadKbps: 5_000,
    });
  });
});

function executionContext(): WorkerExecutionContext {
  const signal = new AbortController().signal;
  const lease: WorkLease = {
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 10_000),
    fencingToken: 1,
    ownerId: 'test',
    renewedAt: new Date(),
    role: WorkerRole.Provisioning,
    workId: operationId,
  };
  return {
    signal,
    async withLease<T>(
      _workId: string,
      work: (signal: AbortSignal, lease: WorkLease) => Promise<T>,
    ) {
      return { acquired: true, value: await work(signal, lease) };
    },
  };
}
