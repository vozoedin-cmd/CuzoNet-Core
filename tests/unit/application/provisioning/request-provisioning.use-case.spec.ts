import { describe, expect, it, beforeEach } from 'vitest';
import { RequestProvisioning } from '../../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';
import { InMemoryProvisioningRequestRepository } from '../../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { InMemoryOutbox } from '../../../../backend/infrastructure/events/in-memory-outbox.js';
import { ProvisioningIdempotencyConflictError } from '../../../../backend/domain/provisioning/errors/provisioning-engine.error.js';
import type { ProvisioningRequestDomainEvent } from '../../../../backend/domain/provisioning/events/provisioning-request-domain-event.js';

describe('RequestProvisioning', () => {
  let repository: InMemoryProvisioningRequestRepository;
  let outbox: InMemoryOutbox<ProvisioningRequestDomainEvent>;
  let useCase: RequestProvisioning;
  const companyContext = { getCompanyId: () => 'company-1' };
  const clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };
  let reqId = 1;
  const idGenerator = { generate: () => `req-${reqId++}` };

  beforeEach(() => {
    reqId = 1;
    repository = new InMemoryProvisioningRequestRepository();
    outbox = new InMemoryOutbox<ProvisioningRequestDomainEvent>();
    useCase = new RequestProvisioning(repository, companyContext, idGenerator, outbox, clock, 5);
  });

  it('should create and save a new request', async () => {
    const input = {
      actionType: 'test',
      idempotencyKey: 'idemp-1',
      inputSnapshotJson: '{"foo":"bar"}',
      targetId: 'tgt-1',
      targetType: 'test_type',
    };

    const result = await useCase.execute(input);
    expect(result.id).toBe('req-1');
    expect(result.status).toBe('pending');
    expect(result.idempotencyKey).toBe('idemp-1');
    
    const saved = await repository.findById('req-1');
    expect(saved).toBeDefined();
  });

  it('same JSON with properties in different order -> same operation', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-2',
      inputSnapshotJson: '{"a":1,"b":2}',
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    const result = await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-2',
      inputSnapshotJson: '{"b":2,"a":1}', // different order
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    expect(result.id).toBe('req-1'); // Returns the first one
  });

  it('nested objects with different order -> same operation', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-3',
      inputSnapshotJson: '{"nested":{"x":100,"y":200}}',
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    const result = await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-3',
      inputSnapshotJson: '{"nested":{"y":200,"x":100}}', // nested different order
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    expect(result.id).toBe('req-1'); 
  });

  it('arrays preserve their order (different order means conflict)', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-4',
      inputSnapshotJson: '{"arr":[1,2]}',
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    await expect(useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-4',
      inputSnapshotJson: '{"arr":[2,1]}', // array order matters!
      targetId: 'tgt-1',
      targetType: 'test_type',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });

  it('same key and targetId diff -> conflict', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-5',
      inputSnapshotJson: '{}',
      targetId: 'tgt-1',
      targetType: 'test_type',
    });

    await expect(useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-5',
      inputSnapshotJson: '{}',
      targetId: 'tgt-2', // targetId diff
      targetType: 'test_type',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });

  it('same key and targetType diff -> conflict', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-6',
      inputSnapshotJson: '{}',
      targetId: 'tgt-1',
      targetType: 'type1',
    });

    await expect(useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-6',
      inputSnapshotJson: '{}',
      targetId: 'tgt-1',
      targetType: 'type2',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });

  it('same key and configurationReference diff -> conflict', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-7',
      inputSnapshotJson: '{}',
      configurationReference: 'ref1',
      targetId: 'tgt-1',
      targetType: 'type1',
    });

    await expect(useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-7',
      inputSnapshotJson: '{}',
      configurationReference: 'ref2',
      targetId: 'tgt-1',
      targetType: 'type1',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });

  it('same key and actionType diff -> conflict', async () => {
    await useCase.execute({
      actionType: 'action1',
      idempotencyKey: 'idemp-8',
      inputSnapshotJson: '{}',
      targetId: 'tgt-1',
      targetType: 'type1',
    });

    await expect(useCase.execute({
      actionType: 'action2',
      idempotencyKey: 'idemp-8',
      inputSnapshotJson: '{}',
      targetId: 'tgt-1',
      targetType: 'type1',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });

  it('same key and payload diff -> conflict', async () => {
    await useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-9',
      inputSnapshotJson: '{"a":1}',
      targetId: 'tgt-1',
      targetType: 'type1',
    });

    await expect(useCase.execute({
      actionType: 'test',
      idempotencyKey: 'idemp-9',
      inputSnapshotJson: '{"a":2}',
      targetId: 'tgt-1',
      targetType: 'type1',
    })).rejects.toThrowError(ProvisioningIdempotencyConflictError);
  });
});
