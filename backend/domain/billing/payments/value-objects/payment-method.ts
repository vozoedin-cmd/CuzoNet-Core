import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export const paymentMethods = ['cash', 'transfer', 'card', 'online', 'other'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export function createPaymentMethod(value: string): PaymentMethod {
  if (!paymentMethods.some((method) => method === value))
    throw new InvalidBillingDataError('method', 'Método de pago no permitido.');
  return value as PaymentMethod;
}
