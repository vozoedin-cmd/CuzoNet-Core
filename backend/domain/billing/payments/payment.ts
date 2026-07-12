import { PaymentRecordedEvent } from '../events/payment-recorded.event.js';
import { BillingConflictError } from '../errors/billing-conflict.error.js';
import type { Money } from '../shared/money.js';
import type { PaymentAllocation } from './payment-allocation.js';
import { PaymentReversal } from './payment-reversal.js';
import type { ExternalPaymentReference } from './value-objects/external-payment-reference.js';
import type { PaymentId } from './value-objects/payment-id.js';
import type { PaymentMethod } from './value-objects/payment-method.js';
import type { PaymentStatus } from './value-objects/payment-status.js';
import type { ReversalReason } from './value-objects/reversal-reason.js';

export interface PaymentProps {
  allocations: readonly PaymentAllocation[];
  amount: Money;
  clientId: string;
  companyId: string;
  externalReference: ExternalPaymentReference | undefined;
  id: PaymentId;
  idempotencyKey: string;
  method: PaymentMethod;
  receivedAt: Date;
  receivedBy: string;
  recordedAt: Date;
  reversal: PaymentReversal | undefined;
  status: PaymentStatus;
}
export interface RecordPaymentProps extends Omit<PaymentProps, 'reversal' | 'status'> {
  billingAccountId: string | null;
  causationId: string;
  correlationId: string;
  eventId: string;
}
export class Payment {
  private readonly domainEvents: PaymentRecordedEvent[] = [];
  private allocationsValue: PaymentAllocation[];
  private reversalValue: PaymentReversal | undefined;
  private statusValue: PaymentStatus;
  private constructor(private readonly props: PaymentProps) {
    if (Number.isNaN(props.receivedAt.getTime()) || Number.isNaN(props.recordedAt.getTime()))
      throw new BillingConflictError('Las fechas del pago no son válidas.');
    this.allocationsValue = [...props.allocations];
    this.reversalValue = props.reversal;
    this.statusValue = props.status;
    this.assertAllocations();
  }
  public static record(props: RecordPaymentProps): Payment {
    if (props.amount.cents <= 0)
      throw new BillingConflictError('El importe del pago debe ser positivo.');
    const payment = new Payment({ ...props, reversal: undefined, status: 'recorded' });
    payment.domainEvents.push(
      new PaymentRecordedEvent({
        aggregateId: props.id.value,
        allocatedCents: payment.allocatedCents,
        amountCents: props.amount.cents,
        billingAccountId: props.billingAccountId,
        causationId: props.causationId,
        clientId: props.clientId,
        companyId: props.companyId,
        correlationId: props.correlationId,
        currencyCode: props.amount.currency.value,
        eventId: props.eventId,
        method: props.method,
        occurredAt: props.recordedAt,
        receivedAt: props.receivedAt,
      }),
    );
    return payment;
  }
  public static rehydrate(props: PaymentProps): Payment {
    return new Payment(props);
  }
  private assertAllocations(): void {
    if (
      this.allocationsValue.some(
        (allocation) => allocation.amount.currency.value !== this.props.amount.currency.value,
      )
    )
      throw new BillingConflictError('Las asignaciones deben usar la moneda del pago.');
    if (this.allocatedCents > this.props.amount.cents)
      throw new BillingConflictError('Las asignaciones superan el importe del pago.');
    const ids = this.allocationsValue.map((allocation) => allocation.invoiceId.value);
    if (new Set(ids).size !== ids.length)
      throw new BillingConflictError('Una factura no puede repetirse en las asignaciones.');
  }
  public allocate(allocation: PaymentAllocation): void {
    if (this.statusValue !== 'recorded')
      throw new BillingConflictError('Un pago revertido no admite asignaciones.');
    this.allocationsValue.push(allocation);
    try {
      this.assertAllocations();
    } catch (error) {
      this.allocationsValue.pop();
      throw error;
    }
  }
  public reverse(at: Date, by: string, reason: ReversalReason): void {
    if (this.statusValue === 'reversed') return;
    this.reversalValue = PaymentReversal.create({ reason, reversedAt: at, reversedBy: by });
    this.statusValue = 'reversed';
  }
  public pullDomainEvents(): readonly PaymentRecordedEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }
  public get allocatedCents(): number {
    return this.allocationsValue.reduce((total, allocation) => total + allocation.amount.cents, 0);
  }
  public get unallocatedCents(): number {
    return this.props.amount.cents - this.allocatedCents;
  }
  public get id(): PaymentId {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get amount(): Money {
    return this.props.amount;
  }
  public get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  public get receivedAt(): Date {
    return new Date(this.props.receivedAt);
  }
  public get method(): PaymentMethod {
    return this.props.method;
  }
  public get externalReference(): ExternalPaymentReference | undefined {
    return this.props.externalReference;
  }
  public get receivedBy(): string {
    return this.props.receivedBy;
  }
  public get recordedAt(): Date {
    return new Date(this.props.recordedAt);
  }
  public get status(): PaymentStatus {
    return this.statusValue;
  }
  public get allocations(): readonly PaymentAllocation[] {
    return [...this.allocationsValue];
  }
  public get reversal(): PaymentReversal | undefined {
    return this.reversalValue;
  }
}
