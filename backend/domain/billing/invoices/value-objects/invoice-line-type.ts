import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export type InvoiceLineType = 'charge' | 'discount' | 'adjustment';
export function createInvoiceLineType(value: string): InvoiceLineType {
  if (value !== 'charge' && value !== 'discount' && value !== 'adjustment')
    throw new InvalidBillingDataError('lineType', 'Tipo de línea no permitido.');
  return value;
}
