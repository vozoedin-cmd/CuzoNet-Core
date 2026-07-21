import type { ProvisioningEventEnvelope } from '../../../application/ports/provisioning/provisioning-event-envelope.js';
import type { ProvisioningEventPublisherPort } from '../../../application/ports/provisioning/provisioning-event-publisher.port.js';

/** Test/dev double that just records every published event in memory. */
export class InMemoryProvisioningEventPublisher implements ProvisioningEventPublisherPort {
  private readonly publishedEvents: ProvisioningEventEnvelope[] = [];

  public async publish(event: ProvisioningEventEnvelope): Promise<void> {
    this.publishedEvents.push(event);
  }

  public events(): readonly ProvisioningEventEnvelope[] {
    return [...this.publishedEvents];
  }
}
