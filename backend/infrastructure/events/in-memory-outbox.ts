import type { OutboxPort } from '../../application/ports/provisioning/outbox.port.js';
import type { ProvisioningDomainEvent } from '../../domain/provisioning/provisioning-operation.js';

export class InMemoryOutbox implements OutboxPort {
  private readonly storedEvents: ProvisioningDomainEvent[] = [];
  public append(events: readonly ProvisioningDomainEvent[]): Promise<void> {
    this.storedEvents.push(...events);
    return Promise.resolve();
  }
  public events(): readonly ProvisioningDomainEvent[] {
    return [...this.storedEvents];
  }
}
