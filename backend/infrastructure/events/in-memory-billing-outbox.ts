import type { BillingOutboxPort } from '../../application/ports/billing/billing-outbox.port.js';
import type { PaymentRecordedEvent } from '../../domain/billing/events/payment-recorded.event.js';
export class InMemoryBillingOutbox implements BillingOutboxPort {
  private readonly stored: PaymentRecordedEvent[] = [];
  public append(events: readonly PaymentRecordedEvent[]): Promise<void> {
    this.stored.push(...events);
    return Promise.resolve();
  }
  public events(): readonly PaymentRecordedEvent[] {
    return [...this.stored];
  }
}
