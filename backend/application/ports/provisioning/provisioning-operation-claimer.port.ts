import type { ProvisioningOperation } from '../../../domain/provisioning/provisioning-operation.js';

export interface ProvisioningOperationClaimer {
  claimNext(companyId: string, at: Date): Promise<ProvisioningOperation | null>;
}
