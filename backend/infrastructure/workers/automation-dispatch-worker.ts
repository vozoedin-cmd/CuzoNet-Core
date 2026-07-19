import type { DispatchAutomationExecutionUseCase } from '../../application/use-cases/automation/dispatch-automation-execution/dispatch-automation-execution.use-case.js';
import type { AutomationExecutionRepository } from '../../application/ports/automation/automation-execution-repository.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

export class AutomationDispatchWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.AutomationDispatch;

  private readonly workerId: string;
  private readonly batchSize: number;

  public constructor(
    private readonly executions: AutomationExecutionRepository,
    private readonly dispatchExecution: DispatchAutomationExecutionUseCase,
    private readonly clock: Clock,
    options: { workerId?: string; batchSize?: number } = {},
  ) {
    this.workerId = options.workerId ?? `automation-dispatch-${Math.random().toString(36).slice(2, 9)}`;
    this.batchSize = options.batchSize ?? 10;
  }

  public async runOnce(context: WorkerExecutionContext) {
    const now = this.clock.now();
    // Use lease duration of 2 minutes
    const leaseUntil = new Date(now.getTime() + 120_000);

    const dueExecutions = await this.executions.claimDue(
      this.workerId,
      now,
      leaseUntil,
      this.batchSize, // Fetch up to batchSize items
    );

    if (dueExecutions.length === 0) {
      return { outcome: 'idle' } as const;
    }

    for (const execution of dueExecutions) {
      // Process each claimed execution
      // Note: We use the existing worker lease abstraction in the system if possible,
      // but here the execution engine handles its own idempotency by locking executions via `processingLeaseUntil`.
      // We will still wrap it in `context.withLease` using the executionId as workId for generalized worker metrics and shutdown safety.
      await context.withLease(execution.id, async (signal) => {
        if (signal.aborted) throw signal.reason;
        
        await this.dispatchExecution.execute(
          execution.companyId,
          execution.id,
          this.workerId,
          leaseUntil,
        );
        return { outcome: 'processed' } as const;
      });
    }

    return { outcome: 'processed' } as const;
  }
}
