export interface RetryPolicy {
  getMaxAttempts(): number;
  isRetryable(errorCode: string): boolean;
  nextAttemptAt(attemptCount: number, failedAt: Date): Date;
}
