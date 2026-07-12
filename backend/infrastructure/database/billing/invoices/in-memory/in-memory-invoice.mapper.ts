import { Invoice } from '../../../../../domain/billing/invoices/invoice.js';
import { InvoiceLine } from '../../../../../domain/billing/invoices/invoice-line.js';
import { BillingAccountId } from '../../../../../domain/billing/accounts/value-objects/billing-account-id.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { Money } from '../../../../../domain/billing/shared/money.js';
import { CancellationReason } from '../../../../../domain/billing/invoices/value-objects/cancellation-reason.js';
import { BillingPeriod } from '../../../../../domain/billing/invoices/value-objects/billing-period.js';
import {
  createInvoiceDocumentStatus,
  type InvoiceDocumentStatus,
} from '../../../../../domain/billing/invoices/value-objects/invoice-document-status.js';
import { InvoiceId } from '../../../../../domain/billing/invoices/value-objects/invoice-id.js';
import { InvoiceDescription } from '../../../../../domain/billing/invoices/value-objects/invoice-description.js';
import { InvoiceDueDate } from '../../../../../domain/billing/invoices/value-objects/invoice-due-date.js';
import { InvoiceLineId } from '../../../../../domain/billing/invoices/value-objects/invoice-line-id.js';
import {
  createInvoiceLineType,
  type InvoiceLineType,
} from '../../../../../domain/billing/invoices/value-objects/invoice-line-type.js';
import { InvoiceNumber } from '../../../../../domain/billing/invoices/value-objects/invoice-number.js';
export interface InvoiceRecord {
  billingAccountId: string;
  cancelledAt: string | undefined;
  cancellationReason: string | undefined;
  clientId: string;
  companyId: string;
  createdAt: string;
  currencyCode: string;
  documentStatus: InvoiceDocumentStatus;
  dueOn: string;
  id: string;
  issuedOn: string;
  lines: readonly {
    amountCents: number;
    description: string;
    id: string;
    periodEnd: string | undefined;
    periodStart: string | undefined;
    type: InvoiceLineType;
  }[];
  number: string;
}
export const inMemoryInvoiceMapper = {
  toRecord(invoice: Invoice): InvoiceRecord {
    return {
      billingAccountId: invoice.billingAccountId.value,
      cancelledAt: invoice.cancelledAt?.toISOString(),
      cancellationReason: invoice.cancellationReason?.value,
      clientId: invoice.clientId,
      companyId: invoice.companyId,
      createdAt: invoice.createdAt.toISOString(),
      currencyCode: invoice.currency.value,
      documentStatus: invoice.documentStatus,
      dueOn: invoice.dueOn.toISOString(),
      id: invoice.id.value,
      issuedOn: invoice.issuedOn.toISOString(),
      lines: invoice.lines.map((line) => ({
        amountCents: line.amount.cents,
        description: line.description.value,
        id: line.id.value,
        periodEnd: line.period?.end.toISOString(),
        periodStart: line.period?.start.toISOString(),
        type: line.type,
      })),
      number: invoice.number.value,
    };
  },
  toDomain(record: InvoiceRecord): Invoice {
    const currency = CurrencyCode.create(record.currencyCode);
    const issuedOn = new Date(record.issuedOn);
    return Invoice.rehydrate({
      billingAccountId: BillingAccountId.create(record.billingAccountId),
      cancelledAt: record.cancelledAt === undefined ? undefined : new Date(record.cancelledAt),
      cancellationReason:
        record.cancellationReason === undefined
          ? undefined
          : CancellationReason.create(record.cancellationReason),
      clientId: record.clientId,
      companyId: record.companyId,
      createdAt: new Date(record.createdAt),
      currency,
      documentStatus: createInvoiceDocumentStatus(record.documentStatus),
      dueOn: InvoiceDueDate.create(new Date(record.dueOn), issuedOn),
      id: InvoiceId.create(record.id),
      issuedOn,
      lines: record.lines.map((line) =>
        InvoiceLine.create({
          amount: Money.create(line.amountCents, currency),
          description: InvoiceDescription.create(line.description),
          id: InvoiceLineId.create(line.id),
          period:
            line.periodStart === undefined || line.periodEnd === undefined
              ? undefined
              : BillingPeriod.create(new Date(line.periodStart), new Date(line.periodEnd)),
          type: createInvoiceLineType(line.type),
        }),
      ),
      number: InvoiceNumber.create(record.number),
    });
  },
};
