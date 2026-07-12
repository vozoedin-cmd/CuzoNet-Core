import type { InvoiceFinancialStatus } from '../../../domain/billing/services/invoice-status-calculator.js';
import type { Invoice } from '../../../domain/billing/invoices/invoice.js';
export interface InvoiceLineDto {
  amountCents: number;
  description: string;
  id: string;
  type: 'charge' | 'discount' | 'adjustment';
}
export interface InvoiceDto {
  billingAccountId: string;
  clientId: string;
  currencyCode: string;
  documentStatus: 'issued' | 'cancelled';
  dueOn: string;
  financialStatus: InvoiceFinancialStatus;
  id: string;
  issuedOn: string;
  lines: readonly InvoiceLineDto[];
  number: string;
  totalCents: number;
}
export function toInvoiceDto(
  invoice: Invoice,
  financialStatus: InvoiceFinancialStatus,
): InvoiceDto {
  return {
    billingAccountId: invoice.billingAccountId.value,
    clientId: invoice.clientId,
    currencyCode: invoice.currency.value,
    documentStatus: invoice.documentStatus,
    dueOn: invoice.dueOn.toISOString().slice(0, 10),
    financialStatus,
    id: invoice.id.value,
    issuedOn: invoice.issuedOn.toISOString().slice(0, 10),
    lines: invoice.lines.map((line) => ({
      amountCents: line.amount.cents,
      description: line.description.value,
      id: line.id.value,
      type: line.type,
    })),
    number: invoice.number.value,
    totalCents: invoice.totalCents,
  };
}
