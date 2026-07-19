export class NotificationRetryPolicy {
  private static readonly delaysByAttempt = Object.freeze([0, 30_000, 120_000, 600_000, 1_800_000]);

  public constructor(public readonly maxAttempts = 5) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
      throw new RangeError('maxAttempts debe estar entre 1 y 5.');
  }

  public delayBeforeAttempt(attemptNumber: number): number | null {
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1) return null;
    if (attemptNumber > this.maxAttempts) return null;
    return NotificationRetryPolicy.delaysByAttempt[attemptNumber - 1] ?? null;
  }

  public nextRetryAt(failedAttemptNumber: number, now: Date): Date | null {
    const delay = this.delayBeforeAttempt(failedAttemptNumber + 1);
    return delay === null ? null : new Date(now.getTime() + delay);
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}
