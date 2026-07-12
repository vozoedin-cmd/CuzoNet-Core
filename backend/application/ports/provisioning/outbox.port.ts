import type { ProvisioningDomainEvent } from '../../../domain/provisioning/provisioning-operation.js';

export interface OutboxPort {
  append(events: readonly ProvisioningDomainEvent[]): Promise<void>;
}
