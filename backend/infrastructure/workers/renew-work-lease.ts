import type { Clock } from '../../application/ports/clock.port.js';
import type { WorkLease, WorkLeaseRepository } from './worker-contracts.js';

export class WorkLeaseLostError extends Error {
  public constructor(role: string, workId: string) {
    super(`Lease perdido para ${role}/${workId}.`);
    this.name = 'WorkLeaseLostError';
  }
}

export class RenewWorkLease {
  public constructor(
    private readonly leases: WorkLeaseRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(lease: WorkLease, durationMs: number): Promise<WorkLease> {
    if (!Number.isInteger(durationMs) || durationMs < 1)
      throw new RangeError('durationMs debe ser un entero mayor que cero.');
    const renewed = await this.leases.renew({
      durationMs,
      fencingToken: lease.fencingToken,
      ownerId: lease.ownerId,
      renewedAt: this.clock.now(),
      role: lease.role,
      workId: lease.workId,
    });
    if (renewed === null) throw new WorkLeaseLostError(lease.role, lease.workId);
    return renewed;
  }
}
