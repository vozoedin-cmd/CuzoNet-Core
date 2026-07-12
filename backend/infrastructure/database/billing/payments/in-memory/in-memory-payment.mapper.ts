import { Payment } from '../../../../../domain/billing/payments/payment.js';
import { PaymentAllocation } from '../../../../../domain/billing/payments/payment-allocation.js';
import { PaymentReversal } from '../../../../../domain/billing/payments/payment-reversal.js';
import { InvoiceId } from '../../../../../domain/billing/invoices/value-objects/invoice-id.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { Money } from '../../../../../domain/billing/shared/money.js';
import { AllocatedMoney } from '../../../../../domain/billing/payments/value-objects/allocated-money.js';
import { ExternalPaymentReference } from '../../../../../domain/billing/payments/value-objects/external-payment-reference.js';
import { PaymentAllocationId } from '../../../../../domain/billing/payments/value-objects/payment-allocation-id.js';
import { PaymentId } from '../../../../../domain/billing/payments/value-objects/payment-id.js';
import {
  createPaymentMethod,
  type PaymentMethod,
} from '../../../../../domain/billing/payments/value-objects/payment-method.js';
import {
  createPaymentStatus,
  type PaymentStatus,
} from '../../../../../domain/billing/payments/value-objects/payment-status.js';
import { ReversalReason } from '../../../../../domain/billing/payments/value-objects/reversal-reason.js';
export interface PaymentRecord {
  allocations: readonly {
    allocatedAt: string;
    amountCents: number;
    billingAccountId: string;
    id: string;
    invoiceId: string;
  }[];
  amountCents: number;
  clientId: string;
  companyId: string;
  currencyCode: string;
  externalReference: string | undefined;
  id: string;
  idempotencyKey: string;
  method: PaymentMethod;
  receivedAt: string;
  receivedBy: string;
  recordedAt: string;
  reversal: { reason: string; reversedAt: string; reversedBy: string } | undefined;
  status: PaymentStatus;
}
export const inMemoryPaymentMapper = {
  toRecord(payment: Payment): PaymentRecord {
    return {
      allocations: payment.allocations.map((allocation) => ({
        allocatedAt: allocation.allocatedAt.toISOString(),
        amountCents: allocation.amount.cents,
        billingAccountId: allocation.billingAccountId,
        id: allocation.id.value,
        invoiceId: allocation.invoiceId.value,
      })),
      amountCents: payment.amount.cents,
      clientId: payment.clientId,
      companyId: payment.companyId,
      currencyCode: payment.amount.currency.value,
      externalReference: payment.externalReference?.value,
      id: payment.id.value,
      idempotencyKey: payment.idempotencyKey,
      method: payment.method,
      receivedAt: payment.receivedAt.toISOString(),
      receivedBy: payment.receivedBy,
      recordedAt: payment.recordedAt.toISOString(),
      reversal:
        payment.reversal === undefined
          ? undefined
          : {
              reason: payment.reversal.reason.value,
              reversedAt: payment.reversal.reversedAt.toISOString(),
              reversedBy: payment.reversal.reversedBy,
            },
      status: payment.status,
    };
  },
  toDomain(record: PaymentRecord): Payment {
    const currency = CurrencyCode.create(record.currencyCode);
    return Payment.rehydrate({
      allocations: record.allocations.map((allocation) =>
        PaymentAllocation.create({
          allocatedAt: new Date(allocation.allocatedAt),
          amount: AllocatedMoney.create(allocation.amountCents, currency),
          billingAccountId: allocation.billingAccountId,
          id: PaymentAllocationId.create(allocation.id),
          invoiceId: InvoiceId.create(allocation.invoiceId),
        }),
      ),
      amount: Money.positive(record.amountCents, currency),
      clientId: record.clientId,
      companyId: record.companyId,
      externalReference:
        record.externalReference === undefined
          ? undefined
          : ExternalPaymentReference.create(record.externalReference),
      id: PaymentId.create(record.id),
      idempotencyKey: record.idempotencyKey,
      method: createPaymentMethod(record.method),
      receivedAt: new Date(record.receivedAt),
      receivedBy: record.receivedBy,
      recordedAt: new Date(record.recordedAt),
      reversal:
        record.reversal === undefined
          ? undefined
          : PaymentReversal.create({
              reason: ReversalReason.create(record.reversal.reason),
              reversedAt: new Date(record.reversal.reversedAt),
              reversedBy: record.reversal.reversedBy,
            }),
      status: createPaymentStatus(record.status),
    });
  },
};
