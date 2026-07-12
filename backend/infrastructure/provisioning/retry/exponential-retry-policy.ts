import type { RetryPolicy } from '../../../application/ports/provisioning/retry-policy.port.js';

export class ExponentialRetryPolicy implements RetryPolicy {
  public constructor(
    private readonly maxAttempts: number,
    private readonly baseDelayMs = 30_000,
  ) {}
  public getMaxAttempts(): number {
    return this.maxAttempts;
  }
  public isRetryable(errorCode: string): boolean {
    return !errorCode.startsWith('PERMANENT_');
  }
  public nextAttemptAt(attemptCount: number, failedAt: Date): Date {
    return new Date(failedAt.getTime() + this.baseDelayMs * 2 ** Math.max(0, attemptCount - 1));
  }
}
