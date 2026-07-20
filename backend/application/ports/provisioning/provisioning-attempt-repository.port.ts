import type { ProvisioningAttempt } from '../../../domain/provisioning/provisioning-attempt.js';

export interface ProvisioningAttemptRepository {
  findByRequestId(requestId: string): Promise<readonly ProvisioningAttempt[]>;
  save(attempt: ProvisioningAttempt): Promise<void>;
}
