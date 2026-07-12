import { InvalidBillingDataError } from '../errors/invalid-billing-data.error.js';
import type { CurrencyCode } from './currency-code.js';

export class Money {
  private constructor(
    public readonly cents: number,
    public readonly currency: CurrencyCode,
  ) {}
  public static create(cents: number, currency: CurrencyCode): Money {
    if (!Number.isSafeInteger(cents))
      throw new InvalidBillingDataError('amountCents', 'Debe ser un entero seguro.');
    return new Money(cents, currency);
  }
  public static positive(cents: number, currency: CurrencyCode): Money {
    if (!Number.isSafeInteger(cents) || cents <= 0)
      throw new InvalidBillingDataError('amountCents', 'Debe ser mayor que cero.');
    return new Money(cents, currency);
  }
}
