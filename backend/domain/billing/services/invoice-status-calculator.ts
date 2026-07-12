import type { Invoice } from '../invoices/invoice.js';

export type InvoiceFinancialStatus = 'open' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export class InvoiceStatusCalculator {
  public calculate(invoice: Invoice, allocatedCents: number, asOf: Date): InvoiceFinancialStatus {
    if (invoice.documentStatus === 'cancelled') return 'cancelled';
    if (allocatedCents >= invoice.totalCents) return 'paid';
    if (invoice.dueOn < asOf) return 'overdue';
    if (allocatedCents > 0) return 'partially_paid';
    return 'open';
  }
}
