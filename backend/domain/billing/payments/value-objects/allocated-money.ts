import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
import type { CurrencyCode } from '../../shared/currency-code.js';

export class AllocatedMoney {
  private constructor(
    public readonly cents: number,
    public readonly currency: CurrencyCode,
  ) {}
  public static create(cents: number, currency: CurrencyCode): AllocatedMoney {
    if (!Number.isSafeInteger(cents) || cents <= 0)
      throw new InvalidBillingDataError(
        'allocations.amountCents',
        'La asignación debe ser un entero mayor que cero.',
      );
    return new AllocatedMoney(cents, currency);
  }
}
