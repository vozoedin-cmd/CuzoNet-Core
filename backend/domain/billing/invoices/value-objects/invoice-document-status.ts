import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export type InvoiceDocumentStatus = 'issued' | 'cancelled';
export function createInvoiceDocumentStatus(value: string): InvoiceDocumentStatus {
  if (value !== 'issued' && value !== 'cancelled')
    throw new InvalidBillingDataError('documentStatus', 'Estado documental no permitido.');
  return value;
}
