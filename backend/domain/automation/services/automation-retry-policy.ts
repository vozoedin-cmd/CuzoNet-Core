export class AutomationRetryPolicy {
  public constructor(
    private readonly maxAttempts: number = 5,
    private readonly baseDelayMs: number = 30_000,
  ) {
    if (this.maxAttempts < 1 || this.maxAttempts > 10) {
      throw new Error('Max attempts must be between 1 and 10');
    }
  }

  public get max(): number {
    return this.maxAttempts;
  }

  public calculateNextAttemptAt(attemptCount: number, now: Date): Date | null {
    if (attemptCount >= this.maxAttempts) {
      return null;
    }
    // Exponential backoff: baseDelayMs * 2^(attemptCount - 1)
    // 1st retry -> 30s
    // 2nd retry -> 60s
    // 3rd retry -> 120s
    // 4th retry -> 240s
    const delayMs = this.baseDelayMs * Math.pow(2, attemptCount - 1);
    return new Date(now.getTime() + delayMs);
  }
}
