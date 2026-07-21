import type { ProvisioningDomainEvent } from '../../../domain/provisioning/provisioning-operation.js';

export interface OutboxPort<TEvent = ProvisioningDomainEvent> {
  append(events: readonly TEvent[]): Promise<void>;
}
