import type { ProvisioningOperation } from '../../../domain/provisioning/provisioning-operation.js';

export interface ProvisioningIdempotencyPort {
  findByIdempotencyKey(
    companyId: string,
    serviceId: string,
    idempotencyKey: string,
  ): Promise<ProvisioningOperation | null>;
}
