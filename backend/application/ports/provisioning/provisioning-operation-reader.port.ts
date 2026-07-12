import type { ProvisioningOperation } from '../../../domain/provisioning/provisioning-operation.js';

export interface ProvisioningOperationReader {
  findById(companyId: string, operationId: string): Promise<ProvisioningOperation | null>;
}
