import type { Invoice } from '../../../domain/billing/invoices/invoice.js';
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<void>;
}
