import type { ProvisioningExecutorPort } from '../../application/ports/provisioning/provisioning-executor.port.js';
import type { ClaimProvisioningOperation } from '../../application/use-cases/provisioning/claim-provisioning-operation/claim-provisioning-operation.use-case.js';
import type { CompleteProvisioningOperation } from '../../application/use-cases/provisioning/complete-provisioning-operation/complete-provisioning-operation.use-case.js';
import type { FailProvisioningOperation } from '../../application/use-cases/provisioning/fail-provisioning-operation/fail-provisioning-operation.use-case.js';
import type { RetryProvisioningOperation } from '../../application/use-cases/provisioning/retry-provisioning-operation/retry-provisioning-operation.use-case.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

export interface ProvisioningWorkerDependencies {
  claim: ClaimProvisioningOperation;
  complete: CompleteProvisioningOperation;
  executor: ProvisioningExecutorPort;
  fail: FailProvisioningOperation;
  retry: RetryProvisioningOperation;
}

export class ProvisioningWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.Provisioning;

  public constructor(private readonly dependencies: ProvisioningWorkerDependencies) {}

  public async runOnce(context: WorkerExecutionContext) {
    const operation = await this.dependencies.claim.execute();
    if (operation === null) return { outcome: 'idle' } as const;
    const execution = await context.withLease(operation.id.value, async (signal) => {
      if (signal.aborted) throw signal.reason;
      let result;
      try {
        result = await this.dependencies.executor.execute({
          correlationId: operation.correlationId,
          operationId: operation.id.value,
          provisionRequest: operation.provisionRequest,
          serviceId: operation.serviceId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error de ejecución desconocido.';
        await this.dependencies.fail.execute({
          errorCode: 'WORKER_EXECUTION_ERROR',
          errorMessage: message,
          operationId: operation.id.value,
        });
        await this.dependencies.retry.execute(operation.id.value);
        return { error: `WORKER_EXECUTION_ERROR: ${message}`, outcome: 'retried' } as const;
      }
      if (result.outcome === 'succeeded') {
        await this.dependencies.complete.execute(operation.id.value);
        return { outcome: 'processed' } as const;
      }
      await this.dependencies.fail.execute({
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        operationId: operation.id.value,
      });
      await this.dependencies.retry.execute(operation.id.value);
      return { error: `${result.errorCode}: ${result.errorMessage}`, outcome: 'retried' } as const;
    });
    return execution.acquired ? execution.value : ({ outcome: 'skipped' } as const);
  }
}
