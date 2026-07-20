import { describe, expect, it } from 'vitest';
import { ProvisioningRequest } from '../../../../backend/domain/provisioning/provisioning-request.js';
import { ProvisioningTransitionError, SensitiveDataInProvisioningError } from '../../../../backend/domain/provisioning/errors/provisioning-engine.error.js';

describe('ProvisioningRequest', () => {
  const baseProps = {
    actionType: 'test_action',
    companyId: 'company-1',
    id: 'req-1',
    idempotencyKey: '',
      inputHash: 'dummy-hash',
    inputSnapshotJson: '{"valid":"json"}',
    maxAttempts: 3,
    configurationReference: undefined,
    sourceExecutionId: undefined,
    targetId: 'tgt-1',
    targetType: 'test_target',
  };

  it('should create a valid request and have pending status', () => {
    const req = ProvisioningRequest.create(baseProps);
    expect(req.status).toBe('pending');
    expect(req.attemptCount).toBe(0);
  });

  it('should prevent storing sensitive data in inputSnapshotJson', () => {
    expect(() => {
      ProvisioningRequest.create({
        ...baseProps,
        inputSnapshotJson: '{"user":"admin", "password":"123"}',
      });
    }).toThrowError(SensitiveDataInProvisioningError);
    
    expect(() => {
      ProvisioningRequest.create({
        ...baseProps,
        inputSnapshotJson: '{"headers": {"Authorization": "Bearer token123"}}',
      });
    }).toThrowError(SensitiveDataInProvisioningError);
  });

  it('should allow claiming if pending', () => {
    const req = ProvisioningRequest.create(baseProps);
    const now = new Date();
    req.claim('worker-1', now);
    expect(req.status).toBe('processing');
    expect(req.processingWorkerId).toBe('worker-1');
  });

  it('should not allow claiming if completed', () => {
    const req = ProvisioningRequest.create(baseProps);
    const now = new Date();
    req.claim('worker-1', now);
    req.complete(now);
    expect(() => req.claim('worker-2', now)).toThrowError(ProvisioningTransitionError);
  });

  it('should allow failTemporarily and then claim again if below maxAttempts', () => {
    const req = ProvisioningRequest.create(baseProps);
    const now = new Date();
    req.claim('worker-1', now);
    
    const next = new Date(now.getTime() + 1000);
    req.failTemporarily('ERR', 'msg', next, now);
    
    expect(req.status).toBe('failed');
    expect(req.attemptCount).toBe(1);
    
    req.claim('worker-2', now);
    expect(req.status).toBe('processing');
  });

  it('should not allow claim if attemptCount >= maxAttempts', () => {
    const req = ProvisioningRequest.create({ ...baseProps, maxAttempts: 1 });
    const now = new Date();
    req.claim('worker-1', now);
    
    const next = new Date(now.getTime() + 1000);
    req.failTemporarily('ERR', 'msg', next, now);
    
    expect(() => req.claim('worker-2', now)).toThrowError(ProvisioningTransitionError);
  });
});
