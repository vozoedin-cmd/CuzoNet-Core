import { InvalidBillingDataError } from '../errors/invalid-billing-data.error.js';

export class CurrencyCode {
  private constructor(public readonly value: string) {}
  public static create(value: string): CurrencyCode {
    const normalized = value.toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized))
      throw new InvalidBillingDataError('currencyCode', 'Debe tener tres letras mayúsculas.');
    return new CurrencyCode(normalized);
  }
}
