import { describe, it, expect } from 'vitest';

import { routerOsSimpleQueueInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-simple-queue.input.js';

describe('routerOsSimpleQueueInputSchema', () => {
  it('should validate a valid create payload', () => {
    const payload = {
      actionType: 'routeros.simple_queue.create',
      maxLimitDownload: '10M',
      maxLimitUpload: '5M',
      queueName: 'cliente-1',
      routerId: 'router-1',
      target: '192.168.1.10',
    };
    const result = routerOsSimpleQueueInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('should reject invalid rate format', () => {
    const payload = {
      actionType: 'routeros.simple_queue.create',
      maxLimitDownload: '10 X',
      maxLimitUpload: '5M',
      queueName: 'cliente-1',
      routerId: 'router-1',
      target: '192.168.1.10',
    };
    const result = routerOsSimpleQueueInputSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it('should validate a valid update payload', () => {
    const payload = {
      actionType: 'routeros.simple_queue.update',
      maxLimitDownload: '20M',
      queueReference: 'cliente-1',
      routerId: 'router-1',
    };
    const result = routerOsSimpleQueueInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });

  it('should validate a valid enable payload', () => {
    const payload = {
      actionType: 'routeros.simple_queue.enable',
      queueReference: 'cliente-1',
      routerId: 'router-1',
    };
    const result = routerOsSimpleQueueInputSchema.safeParse(payload);
    expect(result.success).to.equal(true);
  });
});
