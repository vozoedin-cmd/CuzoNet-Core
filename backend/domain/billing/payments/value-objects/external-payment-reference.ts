import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export class ExternalPaymentReference {
  private constructor(public readonly value: string) {}
  public static create(value: string): ExternalPaymentReference {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 120)
      throw new InvalidBillingDataError('externalReference', 'Referencia externa no permitida.');
    return new ExternalPaymentReference(normalized);
  }
}
