import type { Clock } from '../../application/ports/clock.port.js';
import { RenewWorkLease, WorkLeaseLostError } from './renew-work-lease.js';
import type {
  LeaseExecutionResult,
  WorkLease,
  WorkLeaseRepository,
  WorkerExecutionContext,
  WorkerRoleHandler,
  WorkerRunResult,
  WorkerStatisticEvent,
  WorkerStatisticsRepository,
} from './worker-contracts.js';
import type { WorkerRole } from './worker-role.js';
import { WorkerRetryPolicy } from './worker-retry-policy.js';

export interface WorkerHostOptions {
  idleDelayMs?: number;
  leaseDurationMs?: number;
  leaseRenewalMs?: number;
  shutdownTimeoutMs?: number;
}

export interface WorkerRoleHealth {
  consecutiveFailures: number;
  lastError?: string;
  lastHeartbeatAt?: string;
  lastSuccessAt?: string;
  role: WorkerRole;
  status: 'idle' | 'running' | 'stopped';
}

export interface WorkerHostHealth {
  roles: readonly WorkerRoleHealth[];
  status: 'degraded' | 'healthy' | 'stopped';
  workerId: string;
}

interface MutableRoleHealth {
  consecutiveFailures: number;
  lastError?: string;
  lastHeartbeatAt?: Date;
  lastSuccessAt?: Date;
  status: 'idle' | 'running' | 'stopped';
}

const systemClock: Clock = { now: () => new Date() };

export class WorkerHost {
  private readonly abortController = new AbortController();
  private readonly clock: Clock;
  private readonly healthByRole = new Map<WorkerRole, MutableRoleHealth>();
  private readonly idleDelayMs: number;
  private readonly leaseDurationMs: number;
  private readonly leaseRenewalMs: number;
  private readonly renewWorkLease: RenewWorkLease;
  private readonly retryPolicy: WorkerRetryPolicy;
  private readonly shutdownTimeoutMs: number;
  private readonly workersByRole: ReadonlyMap<WorkerRole, WorkerRoleHandler>;
  private loops: Promise<void>[] = [];
  private started = false;
  private stopped = false;

  public constructor(
    workers: readonly WorkerRoleHandler[],
    private readonly leases: WorkLeaseRepository,
    private readonly statistics: WorkerStatisticsRepository,
    private readonly workerId: string,
    options: WorkerHostOptions = {},
    clock: Clock = systemClock,
    retryPolicy = new WorkerRetryPolicy(),
  ) {
    if (workerId.trim().length === 0) throw new Error('workerId es requerido.');
    this.clock = clock;
    this.idleDelayMs = options.idleDelayMs ?? 500;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.leaseRenewalMs = options.leaseRenewalMs ?? 10_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
    if (this.leaseRenewalMs >= this.leaseDurationMs)
      throw new RangeError('leaseRenewalMs debe ser menor que leaseDurationMs.');
    const entries = workers.map((worker) => [worker.role, worker] as const);
    this.workersByRole = new Map(entries);
    if (this.workersByRole.size !== workers.length)
      throw new Error('No se permiten roles de worker duplicados.');
    this.retryPolicy = retryPolicy;
    this.renewWorkLease = new RenewWorkLease(leases, clock);
    for (const worker of workers)
      this.healthByRole.set(worker.role, { consecutiveFailures: 0, status: 'stopped' });
  }

  public async start(): Promise<void> {
    if (this.started) return;
    if (this.stopped) throw new Error('Un WorkerHost detenido no puede reiniciarse.');
    this.started = true;
    const startedAt = this.clock.now();
    await Promise.all(
      [...this.workersByRole.keys()].map(async (role) => {
        this.setHealth(role, { consecutiveFailures: 0, status: 'idle' });
        await this.statistics.recordStarted(role, this.workerId, startedAt);
      }),
    );
    this.loops = [...this.workersByRole.values()].map((worker) => this.runLoop(worker));
  }

  public async runOnce(role: WorkerRole): Promise<WorkerRunResult> {
    const worker = this.workersByRole.get(role);
    if (worker === undefined) throw new Error(`Worker no registrado: ${role}.`);
    const state = this.requireHealth(role);
    state.status = 'running';
    state.lastHeartbeatAt = this.clock.now();
    await this.statistics.recordHeartbeat(role, this.workerId, state.lastHeartbeatAt);
    try {
      const result = await worker.runOnce(this.createExecutionContext(role));
      const completedAt = this.clock.now();
      state.status = 'idle';
      state.lastHeartbeatAt = completedAt;
      if (result.outcome === 'processed') {
        state.consecutiveFailures = 0;
        delete state.lastError;
        state.lastSuccessAt = completedAt;
      } else if (result.outcome === 'retried') {
        state.consecutiveFailures += 1;
        state.lastError = result.error;
      }
      const event = this.statisticEvent(result);
      if (event !== null)
        await this.statistics.recordResult(
          role,
          this.workerId,
          event,
          completedAt,
          result.outcome === 'retried' ? result.error : undefined,
        );
      return result;
    } catch (error) {
      const failedAt = this.clock.now();
      const message = this.errorMessage(error);
      state.status = 'idle';
      state.consecutiveFailures += 1;
      state.lastError = message;
      state.lastHeartbeatAt = failedAt;
      await this.statistics.recordResult(
        role,
        this.workerId,
        error instanceof WorkLeaseLostError ? 'lease_lost' : 'failed',
        failedAt,
        message,
      );
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.abortController.abort(new Error('WorkerHost detenido.'));
    const completion = Promise.allSettled(this.loops);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('WorkerHost excedió el tiempo de apagado.')),
        this.shutdownTimeoutMs,
      );
      timeout.unref();
    });
    try {
      await Promise.race([completion, timedOut]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      const stoppedAt = this.clock.now();
      await Promise.all(
        [...this.workersByRole.keys()].map(async (role) => {
          this.requireHealth(role).status = 'stopped';
          await this.statistics.recordStopped(role, this.workerId, stoppedAt);
        }),
      );
    }
  }

  public getHealth(): WorkerHostHealth {
    const roles = [...this.healthByRole.entries()].map(([role, state]): WorkerRoleHealth => ({
      consecutiveFailures: state.consecutiveFailures,
      ...(state.lastError === undefined ? {} : { lastError: state.lastError }),
      ...(state.lastHeartbeatAt === undefined
        ? {}
        : { lastHeartbeatAt: state.lastHeartbeatAt.toISOString() }),
      ...(state.lastSuccessAt === undefined
        ? {}
        : { lastSuccessAt: state.lastSuccessAt.toISOString() }),
      role,
      status: state.status,
    }));
    return {
      roles,
      status: this.stopped
        ? 'stopped'
        : roles.some((role) => role.consecutiveFailures > 0)
          ? 'degraded'
          : 'healthy',
      workerId: this.workerId,
    };
  }

  private async runLoop(worker: WorkerRoleHandler): Promise<void> {
    let failureAttempt = 0;
    while (!this.abortController.signal.aborted) {
      try {
        const result = await this.runOnce(worker.role);
        failureAttempt = result.outcome === 'retried' ? failureAttempt + 1 : 0;
        const delayMs =
          result.outcome === 'idle' || result.outcome === 'skipped'
            ? this.idleDelayMs
            : result.outcome === 'retried'
              ? this.retryPolicy.delayFor(failureAttempt)
              : 0;
        if (delayMs > 0) await this.delay(delayMs);
      } catch {
        if (this.abortController.signal.aborted) break;
        failureAttempt += 1;
        await this.delay(this.retryPolicy.delayFor(failureAttempt));
      }
    }
  }

  private createExecutionContext(role: WorkerRole): WorkerExecutionContext {
    return {
      signal: this.abortController.signal,
      withLease: <T>(workId: string, work: (signal: AbortSignal, lease: WorkLease) => Promise<T>) =>
        this.withLease(role, workId, work),
    };
  }

  private async withLease<T>(
    role: WorkerRole,
    workId: string,
    work: (signal: AbortSignal, lease: WorkLease) => Promise<T>,
  ): Promise<LeaseExecutionResult<T>> {
    let lease = await this.leases.tryAcquire({
      acquiredAt: this.clock.now(),
      durationMs: this.leaseDurationMs,
      ownerId: this.workerId,
      role,
      workId,
    });
    if (lease === null) return { acquired: false };
    const workController = new AbortController();
    const abortWork = () => workController.abort(this.abortController.signal.reason);
    this.abortController.signal.addEventListener('abort', abortWork, { once: true });
    let leaseLostError: WorkLeaseLostError | undefined;
    let renewal: Promise<void> | null = null;
    const renewalTimer = setInterval(() => {
      if (renewal !== null || workController.signal.aborted) return;
      renewal = this.renewWorkLease
        .execute(lease as WorkLease, this.leaseDurationMs)
        .then((renewed) => {
          lease = renewed;
        })
        .catch((error: unknown) => {
          leaseLostError =
            error instanceof WorkLeaseLostError ? error : new WorkLeaseLostError(role, workId);
          workController.abort(leaseLostError);
        })
        .finally(() => {
          renewal = null;
        });
    }, this.leaseRenewalMs);
    renewalTimer.unref();
    try {
      const value = await work(workController.signal, lease);
      clearInterval(renewalTimer);
      const pendingRenewal = renewal as Promise<void> | null;
      if (pendingRenewal !== null) await pendingRenewal;
      if (leaseLostError !== undefined) throw leaseLostError;
      return { acquired: true, value };
    } finally {
      clearInterval(renewalTimer);
      const pendingRenewal = renewal as Promise<void> | null;
      if (pendingRenewal !== null) await pendingRenewal;
      this.abortController.signal.removeEventListener('abort', abortWork);
      await this.leases.release(lease, this.clock.now());
    }
  }

  private statisticEvent(result: WorkerRunResult): WorkerStatisticEvent | null {
    if (result.outcome === 'idle') return null;
    return result.outcome;
  }

  private setHealth(role: WorkerRole, health: MutableRoleHealth): void {
    this.healthByRole.set(role, health);
  }

  private requireHealth(role: WorkerRole): MutableRoleHealth {
    const health = this.healthByRole.get(role);
    if (health === undefined) throw new Error(`Health no registrado para ${role}.`);
    return health;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.abortController.signal.aborted) {
        resolve();
        return;
      }
      const complete = () => {
        this.abortController.signal.removeEventListener('abort', stop);
        resolve();
      };
      const timer = setTimeout(complete, milliseconds);
      const stop = () => {
        clearTimeout(timer);
        complete();
      };
      this.abortController.signal.addEventListener('abort', stop, { once: true });
      timer.unref();
    });
  }
}
