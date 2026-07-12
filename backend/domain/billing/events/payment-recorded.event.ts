import type { PaymentMethod } from '../payments/value-objects/payment-method.js';

export interface PaymentRecordedEventProps {
  aggregateId: string;
  allocatedCents: number;
  amountCents: number;
  billingAccountId: string | null;
  causationId: string;
  clientId: string;
  companyId: string;
  correlationId: string;
  currencyCode: string;
  eventId: string;
  method: PaymentMethod;
  occurredAt: Date;
  receivedAt: Date;
}
export class PaymentRecordedEvent {
  public readonly aggregateType = 'Payment';
  public readonly eventType = 'PaymentRecorded.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{
    allocatedCents: number;
    amountCents: number;
    billingAccountId: string | null;
    clientId: string;
    companyId: string;
    currencyCode: string;
    method: PaymentMethod;
    paymentId: string;
    receivedAt: string;
    unallocatedCents: number;
  }>;
  public constructor(props: PaymentRecordedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      allocatedCents: props.allocatedCents,
      amountCents: props.amountCents,
      billingAccountId: props.billingAccountId,
      clientId: props.clientId,
      companyId: props.companyId,
      currencyCode: props.currencyCode,
      method: props.method,
      paymentId: props.aggregateId,
      receivedAt: props.receivedAt.toISOString(),
      unallocatedCents: props.amountCents - props.allocatedCents,
    });
  }
}
