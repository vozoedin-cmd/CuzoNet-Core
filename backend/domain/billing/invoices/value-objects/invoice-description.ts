import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';

export class InvoiceDescription {
  private constructor(public readonly value: string) {}

  public static create(value: string): InvoiceDescription {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 240)
      throw new InvalidBillingDataError('description', 'Descripción no permitida.');
    return new InvoiceDescription(normalized);
  }
}
