import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProvisioningDispatchWorker } from '../../../../backend/infrastructure/workers/provisioning-dispatch-worker.js';
import { InMemoryProvisioningRequestRepository } from '../../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import type { DispatchProvisioningRequest } from '../../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { ProvisioningRequest } from '../../../../backend/domain/provisioning/provisioning-request.js';
import type { WorkerExecutionContext } from '../../../../backend/infrastructure/workers/worker-contracts.js';

describe('ProvisioningDispatchWorker', () => {
  let repository: InMemoryProvisioningRequestRepository;
  let dispatchMock: { execute: ReturnType<typeof vi.fn> };
  let worker: ProvisioningDispatchWorker;
  const clock = { now: () => new Date('2026-07-19T12:00:00Z') };

  beforeEach(() => {
    repository = new InMemoryProvisioningRequestRepository();
    dispatchMock = { execute: vi.fn().mockResolvedValue(undefined) };
    worker = new ProvisioningDispatchWorker(
      repository,
      dispatchMock as unknown as DispatchProvisioningRequest,
      clock,
      { workerId: 'test-worker', batchSize: 5 }
    );
  });

  it('should return idle if no requests are due', async () => {
    const context: WorkerExecutionContext = {
      withLease: vi.fn(),
      signal: new AbortController().signal,
    };

    const result = await worker.runOnce(context);
    expect(result.outcome).toBe('idle');
    expect(dispatchMock.execute).not.toHaveBeenCalled();
  });

  it('should claim and process due requests', async () => {
    const req = ProvisioningRequest.create({
      actionType: 'test',
      companyId: 'c1',
      id: 'req-1',
      idempotencyKey: '',
      inputHash: 'dummy-hash',
      inputSnapshotJson: '{}',
      maxAttempts: 3,
      configurationReference: undefined,
      sourceExecutionId: undefined,
      targetId: 't1',
      targetType: 'tt1',
    });
    await repository.save(req);

    const context: WorkerExecutionContext = {
      signal: new AbortController().signal,
      withLease: vi.fn().mockImplementation(async (id, cb) => cb({ aborted: false })),
    };

    const result = await worker.runOnce(context);
    expect(result.outcome).toBe('processed');
    
    const saved = await repository.findById('req-1');
    expect(saved?.status).toBe('processing');
    expect(saved?.processingWorkerId).toBe('test-worker');
    
    expect(dispatchMock.execute).toHaveBeenCalledWith({
      requestId: 'req-1',
      workerId: 'test-worker',
    });
  });
});
