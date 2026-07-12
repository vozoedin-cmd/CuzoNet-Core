import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export type PaymentStatus = 'recorded' | 'reversed';
export function createPaymentStatus(value: string): PaymentStatus {
  if (value !== 'recorded' && value !== 'reversed')
    throw new InvalidBillingDataError('status', 'Estado de pago no permitido.');
  return value;
}
