import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class PaymentId {
  private constructor(public readonly value: string) {}
  public static create(value: string): PaymentId {
    const normalized = value.toLowerCase();
    if (!UUID.test(normalized))
      throw new InvalidBillingDataError('paymentId', 'Debe ser un UUID válido.');
    return new PaymentId(normalized);
  }
}
