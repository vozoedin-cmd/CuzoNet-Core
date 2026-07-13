import { BillingAccountId } from '../../../../../domain/billing/accounts/value-objects/billing-account-id.js';
import { Invoice } from '../../../../../domain/billing/invoices/invoice.js';
import { InvoiceLine } from '../../../../../domain/billing/invoices/invoice-line.js';
import { BillingPeriod } from '../../../../../domain/billing/invoices/value-objects/billing-period.js';
import { CancellationReason } from '../../../../../domain/billing/invoices/value-objects/cancellation-reason.js';
import { createInvoiceDocumentStatus } from '../../../../../domain/billing/invoices/value-objects/invoice-document-status.js';
import { InvoiceDueDate } from '../../../../../domain/billing/invoices/value-objects/invoice-due-date.js';
import { InvoiceDescription } from '../../../../../domain/billing/invoices/value-objects/invoice-description.js';
import { InvoiceId } from '../../../../../domain/billing/invoices/value-objects/invoice-id.js';
import { InvoiceLineId } from '../../../../../domain/billing/invoices/value-objects/invoice-line-id.js';
import { createInvoiceLineType } from '../../../../../domain/billing/invoices/value-objects/invoice-line-type.js';
import { InvoiceNumber } from '../../../../../domain/billing/invoices/value-objects/invoice-number.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { Money } from '../../../../../domain/billing/shared/money.js';
import type { InvoiceItemTable, InvoiceTable } from '../../../sqlite/database-schema.js';

export const sqliteInvoiceMapper = {
  toDomain(record: InvoiceTable, items: readonly InvoiceItemTable[]): Invoice {
    const currency = CurrencyCode.create(record.currency_code);
    const issuedOn = new Date(record.issued_on);
    return Invoice.rehydrate({
      billingAccountId: BillingAccountId.create(record.billing_account_id),
      cancelledAt: record.cancelled_at === null ? undefined : new Date(record.cancelled_at),
      cancellationReason:
        record.cancellation_reason === null
          ? undefined
          : CancellationReason.create(record.cancellation_reason),
      clientId: record.client_id,
      companyId: record.company_id,
      createdAt: new Date(record.created_at),
      currency,
      documentStatus: createInvoiceDocumentStatus(record.document_status),
      dueOn: InvoiceDueDate.create(new Date(record.due_on), issuedOn),
      id: InvoiceId.create(record.id),
      issuedOn,
      lines: [...items]
        .sort((left, right) => left.position - right.position)
        .map((item) =>
          InvoiceLine.create({
            amount: Money.create(item.amount_cents, currency),
            description: InvoiceDescription.create(item.description),
            id: InvoiceLineId.create(item.id),
            period:
              item.period_start === null || item.period_end === null
                ? undefined
                : BillingPeriod.create(new Date(item.period_start), new Date(item.period_end)),
            type: createInvoiceLineType(item.item_type),
          }),
        ),
      number: InvoiceNumber.create(record.number),
    });
  },
};
