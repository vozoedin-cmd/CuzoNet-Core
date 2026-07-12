import type { ProvisioningOperation } from '../../../domain/provisioning/provisioning-operation.js';
import type { OperationTypeValue } from '../../../domain/provisioning/value-objects/operation-type.js';

export interface ProvisioningOperationRepository {
  hasNonTerminal(companyId: string, serviceId: string, type: OperationTypeValue): Promise<boolean>;
  save(operation: ProvisioningOperation): Promise<void>;
}
