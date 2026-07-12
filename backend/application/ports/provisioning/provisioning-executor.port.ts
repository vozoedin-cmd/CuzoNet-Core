import type { ProvisionRequest } from '../../../domain/provisioning/value-objects/provision-request.js';

export interface ProvisioningExecutionCommand {
  correlationId: string;
  operationId: string;
  provisionRequest: ProvisionRequest;
  serviceId: string;
}

export type ProvisioningExecutionResult =
  { outcome: 'succeeded' } | { errorCode: string; errorMessage: string; outcome: 'failed' };

export interface ProvisioningExecutorPort {
  execute(command: ProvisioningExecutionCommand): Promise<ProvisioningExecutionResult>;
}
