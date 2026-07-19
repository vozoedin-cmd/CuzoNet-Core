import { describe, expect, it } from 'vitest';
import { environmentSchema } from '../../../../backend/infrastructure/config/environment.js';

describe('Environment Configuration', () => {
  it('usa defaults independientes para el Automation Engine', () => {
    const result = environmentSchema.safeParse({
      APP_NAME: 'Test',
      NODE_ENV: 'test',
      TIMEZONE: 'America/Guatemala',
      LOG_LEVEL: 'info',
    });

    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTOMATION_WORKER_INTERVAL_MS).toBe(5000);
      expect(result.data.AUTOMATION_WORKER_BATCH_SIZE).toBe(20);
      expect(result.data.AUTOMATION_WORKER_LEASE_SECONDS).toBe(60);
      expect(result.data.AUTOMATION_MAX_ATTEMPTS).toBe(5);
      expect(result.data.AUTOMATION_MAX_CAUSAL_DEPTH).toBe(5);
      expect(result.data.AUTOMATION_WORKER_ENABLED).toBe(false);
    }
  });

  it('acepta valores personalizados mediante process.env', () => {
    const result = environmentSchema.safeParse({
      APP_NAME: 'Test',
      NODE_ENV: 'test',
      TIMEZONE: 'America/Guatemala',
      LOG_LEVEL: 'info',
      AUTOMATION_WORKER_INTERVAL_MS: '10000',
      AUTOMATION_WORKER_BATCH_SIZE: '50',
      AUTOMATION_WORKER_LEASE_SECONDS: '120',
      AUTOMATION_MAX_ATTEMPTS: '3',
      AUTOMATION_MAX_CAUSAL_DEPTH: '2',
      AUTOMATION_WORKER_ENABLED: 'true',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTOMATION_WORKER_INTERVAL_MS).toBe(10000);
      expect(result.data.AUTOMATION_WORKER_BATCH_SIZE).toBe(50);
      expect(result.data.AUTOMATION_WORKER_LEASE_SECONDS).toBe(120);
      expect(result.data.AUTOMATION_MAX_ATTEMPTS).toBe(3);
      expect(result.data.AUTOMATION_MAX_CAUSAL_DEPTH).toBe(2);
      expect(result.data.AUTOMATION_WORKER_ENABLED).toBe(true);
    }
  });

  it('rechaza valores fuera de rango', () => {
    const result = environmentSchema.safeParse({
      APP_NAME: 'Test',
      NODE_ENV: 'test',
      TIMEZONE: 'America/Guatemala',
      LOG_LEVEL: 'info',
      AUTOMATION_WORKER_INTERVAL_MS: '1', // min 100
      AUTOMATION_WORKER_BATCH_SIZE: '0', // min 1
      AUTOMATION_WORKER_LEASE_SECONDS: '4', // min 5
      AUTOMATION_MAX_ATTEMPTS: '0', // min 1
      AUTOMATION_MAX_CAUSAL_DEPTH: '0', // min 1
    });

    expect(result.success).toBe(false);
  });
});
