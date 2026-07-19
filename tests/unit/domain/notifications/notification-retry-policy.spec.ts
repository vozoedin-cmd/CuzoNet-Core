import { describe, expect, it } from 'vitest';

import {
  isRetryableHttpStatus,
  NotificationRetryPolicy,
} from '../../../../backend/domain/notifications/notification-retry-policy.js';

describe('NotificationRetryPolicy', () => {
  it('uses exact deterministic delays and five attempts maximum', () => {
    const policy = new NotificationRetryPolicy();
    expect([1, 2, 3, 4, 5, 6].map((attempt) => policy.delayBeforeAttempt(attempt))).toEqual([
      0,
      30_000,
      120_000,
      600_000,
      1_800_000,
      null,
    ]);
  });

  it('classifies retryable and permanent HTTP failures', () => {
    expect([408, 425, 429, 500, 599].every(isRetryableHttpStatus)).toBe(true);
    expect([400, 401, 403, 404].some(isRetryableHttpStatus)).toBe(false);
  });
});
