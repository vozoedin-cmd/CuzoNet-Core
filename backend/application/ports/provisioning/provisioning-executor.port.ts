import type { ProvisionRequest } from '../../../domain/provisioning/value-objects/provision-request.js';

export interface ProvisioningExecutionCommand {
  companyId: string;
  correlationId: string;
  downloadKbps: number;
  operationId: string;
  provisionRequest: ProvisionRequest;
  serviceId: string;
  uploadKbps: number;
}

export type ProvisioningExecutionResult =
  { outcome: 'succeeded' } | { errorCode: string; errorMessage: string; outcome: 'failed' };

export interface ProvisioningExecutorPort {
  execute(command: ProvisioningExecutionCommand): Promise<ProvisioningExecutionResult>;
}
