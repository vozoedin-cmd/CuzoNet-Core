import type { OutboxPort } from '../../application/ports/provisioning/outbox.port.js';
import type { ProvisioningDomainEvent } from '../../domain/provisioning/provisioning-operation.js';

export class InMemoryOutbox<TEvent = ProvisioningDomainEvent> implements OutboxPort<TEvent> {
  private readonly storedEvents: TEvent[] = [];
  public append(events: readonly TEvent[]): Promise<void> {
    this.storedEvents.push(...events);
    return Promise.resolve();
  }
  public events(): readonly TEvent[] {
    return [...this.storedEvents];
  }
}
