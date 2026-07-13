import type { WorkerRole } from './worker-role.js';

export interface WorkLease {
  acquiredAt: Date;
  expiresAt: Date;
  fencingToken: number;
  ownerId: string;
  renewedAt: Date;
  role: WorkerRole;
  workId: string;
}

export interface TryAcquireWorkLeaseInput {
  acquiredAt: Date;
  durationMs: number;
  ownerId: string;
  role: WorkerRole;
  workId: string;
}

export interface RenewWorkLeaseInput {
  durationMs: number;
  fencingToken: number;
  ownerId: string;
  renewedAt: Date;
  role: WorkerRole;
  workId: string;
}

export interface WorkLeaseRepository {
  release(lease: WorkLease, releasedAt: Date): Promise<boolean>;
  renew(input: RenewWorkLeaseInput): Promise<WorkLease | null>;
  tryAcquire(input: TryAcquireWorkLeaseInput): Promise<WorkLease | null>;
}

export type WorkerStatisticEvent = 'failed' | 'lease_lost' | 'processed' | 'retried' | 'skipped';

export interface WorkerStatisticsRepository {
  recordHeartbeat(role: WorkerRole, workerId: string, at: Date): Promise<void>;
  recordResult(
    role: WorkerRole,
    workerId: string,
    event: WorkerStatisticEvent,
    at: Date,
    error?: string,
  ): Promise<void>;
  recordStarted(role: WorkerRole, workerId: string, at: Date): Promise<void>;
  recordStopped(role: WorkerRole, workerId: string, at: Date): Promise<void>;
}

export type WorkerRunResult =
  | { outcome: 'idle' }
  | { outcome: 'processed' }
  | { outcome: 'retried'; error: string }
  | { outcome: 'skipped' };

export type LeaseExecutionResult<T> = { acquired: false } | { acquired: true; value: T };

export interface WorkerExecutionContext {
  readonly signal: AbortSignal;
  withLease<T>(
    workId: string,
    work: (signal: AbortSignal, lease: WorkLease) => Promise<T>,
  ): Promise<LeaseExecutionResult<T>>;
}

export interface WorkerRoleHandler {
  readonly role: WorkerRole;
  runOnce(context: WorkerExecutionContext): Promise<WorkerRunResult>;
}
