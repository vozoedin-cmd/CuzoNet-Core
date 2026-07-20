import type { DispatchProvisioningRequest } from '../../application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import type { ProvisioningRequestRepository } from '../../application/ports/provisioning/provisioning-request-repository.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

export class ProvisioningDispatchWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.ProvisioningDispatch;

  private readonly workerId: string;
  private readonly batchSize: number;

  public constructor(
    private readonly requests: ProvisioningRequestRepository,
    private readonly dispatchRequest: DispatchProvisioningRequest,
    private readonly clock: Clock,
    options: { workerId?: string; batchSize?: number } = {},
  ) {
    this.workerId = options.workerId ?? `provisioning-dispatch-${Math.random().toString(36).slice(2, 9)}`;
    this.batchSize = options.batchSize ?? 10;
  }

  public async runOnce(context: WorkerExecutionContext) {
    const now = this.clock.now();

    const dueRequests = await this.requests.claimDue(
      this.batchSize,
      this.workerId,
      now,
    );

    if (dueRequests.length === 0) {
      return { outcome: 'idle' } as const;
    }

    for (const request of dueRequests) {
      await context.withLease(request.id, async (signal) => {
        if (signal.aborted) throw signal.reason;
        
        await this.dispatchRequest.execute({
          requestId: request.id,
          workerId: this.workerId,
        });
        
        return { outcome: 'processed' } as const;
      });
    }

    return { outcome: 'processed' } as const;
  }
}
