export interface WorkerRetryPolicyOptions {
  baseDelayMs?: number;
  maximumDelayMs?: number;
}

export class WorkerRetryPolicy {
  private readonly baseDelayMs: number;
  private readonly maximumDelayMs: number;

  public constructor(options: WorkerRetryPolicyOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maximumDelayMs = options.maximumDelayMs ?? 30_000;
    if (!Number.isInteger(this.baseDelayMs) || this.baseDelayMs < 1)
      throw new RangeError('baseDelayMs debe ser un entero mayor que cero.');
    if (!Number.isInteger(this.maximumDelayMs) || this.maximumDelayMs < this.baseDelayMs)
      throw new RangeError('maximumDelayMs debe ser mayor o igual que baseDelayMs.');
  }

  public delayFor(attempt: number): number {
    const exponent = Math.max(0, Math.min(30, attempt - 1));
    return Math.min(this.maximumDelayMs, this.baseDelayMs * 2 ** exponent);
  }
}
