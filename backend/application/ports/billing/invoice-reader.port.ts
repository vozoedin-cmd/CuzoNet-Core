import type { Invoice } from '../../../domain/billing/invoices/invoice.js';
export interface InvoiceListCriteria {
  accountId?: string;
  clientId?: string;
  companyId: string;
  from?: Date;
  to?: Date;
}
export interface InvoiceReader {
  findById(companyId: string, invoiceId: string): Promise<Invoice | null>;
  list(criteria: InvoiceListCriteria): Promise<readonly Invoice[]>;
}
