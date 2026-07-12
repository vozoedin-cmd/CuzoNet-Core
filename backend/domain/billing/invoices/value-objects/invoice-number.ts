import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export class InvoiceNumber {
  private constructor(public readonly value: string) {}
  public static create(value: string): InvoiceNumber {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 64 || !/^[A-Za-z0-9._/-]+$/.test(normalized))
      throw new InvalidBillingDataError('number', 'Número de documento no permitido.');
    return new InvoiceNumber(normalized);
  }
}
