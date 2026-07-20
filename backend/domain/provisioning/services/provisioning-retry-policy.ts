export interface ProvisioningRetryPolicyResult {
  nextAttemptAt: Date | undefined;
  terminal: boolean;
}

export class ProvisioningRetryPolicy {
  public constructor(
    private readonly maxAttempts: number,
    private readonly baseDelayMs: number = 2000,
    private readonly maxDelayMs: number = 300000,
  ) {}

  public calculateNextAttempt(
    currentAttemptCount: number,
    outcome: 'success' | 'temporaryFailure' | 'permanentFailure',
    errorCode: string | undefined,
    retryAfterMs?: number,
    at: Date = new Date(),
  ): ProvisioningRetryPolicyResult {
    if (outcome === 'success') {
      return { nextAttemptAt: undefined, terminal: true };
    }

    if (outcome === 'permanentFailure') {
      return { nextAttemptAt: undefined, terminal: true };
    }

    // Errores conocidos que son definitivamente permanentes
    if (errorCode === 'PROVISIONING_ADAPTER_DISABLED' || errorCode === 'INVALID_CREDENTIALS') {
      return { nextAttemptAt: undefined, terminal: true };
    }

    if (currentAttemptCount >= this.maxAttempts) {
      return { nextAttemptAt: undefined, terminal: true };
    }

    const delay = this.calculateDelay(currentAttemptCount, retryAfterMs);
    const nextAttemptAt = new Date(at.getTime() + delay);

    return { nextAttemptAt, terminal: false };
  }

  private calculateDelay(currentAttemptCount: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      return Math.min(retryAfterMs, this.maxDelayMs);
    }
    const backoff = this.baseDelayMs * Math.pow(2, Math.max(0, currentAttemptCount - 1));
    return Math.min(backoff, this.maxDelayMs);
  }
}
