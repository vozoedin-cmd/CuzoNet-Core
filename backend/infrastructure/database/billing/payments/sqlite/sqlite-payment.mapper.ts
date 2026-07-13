import { InvoiceId } from '../../../../../domain/billing/invoices/value-objects/invoice-id.js';
import { Payment } from '../../../../../domain/billing/payments/payment.js';
import { PaymentAllocation } from '../../../../../domain/billing/payments/payment-allocation.js';
import { PaymentReversal } from '../../../../../domain/billing/payments/payment-reversal.js';
import { AllocatedMoney } from '../../../../../domain/billing/payments/value-objects/allocated-money.js';
import { ExternalPaymentReference } from '../../../../../domain/billing/payments/value-objects/external-payment-reference.js';
import { PaymentAllocationId } from '../../../../../domain/billing/payments/value-objects/payment-allocation-id.js';
import { PaymentId } from '../../../../../domain/billing/payments/value-objects/payment-id.js';
import { createPaymentMethod } from '../../../../../domain/billing/payments/value-objects/payment-method.js';
import { createPaymentStatus } from '../../../../../domain/billing/payments/value-objects/payment-status.js';
import { ReversalReason } from '../../../../../domain/billing/payments/value-objects/reversal-reason.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { Money } from '../../../../../domain/billing/shared/money.js';
import type { PaymentAllocationTable, PaymentTable } from '../../../sqlite/database-schema.js';

export const sqlitePaymentMapper = {
  toDomain(record: PaymentTable, rows: readonly PaymentAllocationTable[]): Payment {
    const currency = CurrencyCode.create(record.currency_code);
    return Payment.rehydrate({
      allocations: rows.map((allocation) =>
        PaymentAllocation.create({
          allocatedAt: new Date(allocation.allocated_at),
          amount: AllocatedMoney.create(allocation.amount_cents, currency),
          billingAccountId: allocation.billing_account_id,
          id: PaymentAllocationId.create(allocation.id),
          invoiceId: InvoiceId.create(allocation.invoice_id),
        }),
      ),
      amount: Money.positive(record.amount_cents, currency),
      clientId: record.client_id,
      companyId: record.company_id,
      externalReference:
        record.external_reference === null
          ? undefined
          : ExternalPaymentReference.create(record.external_reference),
      id: PaymentId.create(record.id),
      idempotencyKey: record.idempotency_key,
      method: createPaymentMethod(record.method),
      receivedAt: new Date(record.received_at),
      receivedBy: record.received_by,
      recordedAt: new Date(record.recorded_at),
      reversal:
        record.reversal_reason === null ||
        record.reversed_at === null ||
        record.reversed_by === null
          ? undefined
          : PaymentReversal.create({
              reason: ReversalReason.create(record.reversal_reason),
              reversedAt: new Date(record.reversed_at),
              reversedBy: record.reversed_by,
            }),
      status: createPaymentStatus(record.status),
    });
  },
};
