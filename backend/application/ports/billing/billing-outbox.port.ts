import type { PaymentRecordedEvent } from '../../../domain/billing/events/payment-recorded.event.js';
export interface BillingOutboxPort {
  append(events: readonly PaymentRecordedEvent[]): Promise<void>;
}
