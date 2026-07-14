import type { ProvisioningExecutorPort } from '../../application/ports/provisioning/provisioning-executor.port.js';
import type { ProvisioningProfileReader } from '../../application/ports/provisioning/provisioning-profile-reader.port.js';
import type { ServiceProvisioningReader } from '../../application/ports/provisioning/service-provisioning-reader.port.js';
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
  profiles: ProvisioningProfileReader;
  retry: RetryProvisioningOperation;
  services: ServiceProvisioningReader;
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
        const service = await this.dependencies.services.findById(
          operation.companyId,
          operation.serviceId,
        );
        if (service === null) {
          return this.handleFailure(
            operation.id.value,
            'PERMANENT_PROVISIONING_SERVICE_NOT_FOUND',
            'No se encontro el servicio requerido por la operacion.',
          );
        }
        const profile = await this.dependencies.profiles.findByPlanVersionId(
          operation.companyId,
          service.planVersionId,
        );
        if (profile === null) {
          return this.handleFailure(
            operation.id.value,
            'PERMANENT_PROVISIONING_PROFILE_NOT_FOUND',
            'No se encontro el perfil tecnico del plan.',
          );
        }
        const bandwidth = this.resolveBandwidth(profile.values);
        if (bandwidth === null) {
          return this.handleFailure(
            operation.id.value,
            'PERMANENT_PROVISIONING_PROFILE_INVALID',
            'El perfil tecnico requiere uploadKbps y downloadKbps enteros mayores que cero.',
          );
        }
        result = await this.dependencies.executor.execute({
          companyId: operation.companyId,
          correlationId: operation.correlationId,
          downloadKbps: bandwidth.downloadKbps,
          operationId: operation.id.value,
          provisionRequest: operation.provisionRequest,
          serviceId: operation.serviceId,
          uploadKbps: bandwidth.uploadKbps,
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
      return this.handleFailure(operation.id.value, result.errorCode, result.errorMessage);
    });
    return execution.acquired ? execution.value : ({ outcome: 'skipped' } as const);
  }

  private async handleFailure(operationId: string, errorCode: string, errorMessage: string) {
    await this.dependencies.fail.execute({ errorCode, errorMessage, operationId });
    await this.dependencies.retry.execute(operationId);
    return { error: `${errorCode}: ${errorMessage}`, outcome: 'retried' } as const;
  }

  private resolveBandwidth(
    values: Readonly<Record<string, string | number | boolean>>,
  ): { downloadKbps: number; uploadKbps: number } | null {
    const downloadKbps = this.positiveInteger(values.downloadKbps);
    const uploadKbps = this.positiveInteger(values.uploadKbps);
    if (downloadKbps === undefined || uploadKbps === undefined) return null;
    return {
      downloadKbps,
      uploadKbps,
    };
  }

  private positiveInteger(value: string | number | boolean | undefined): number | undefined {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0
      ? parsed
      : undefined;
  }
}
