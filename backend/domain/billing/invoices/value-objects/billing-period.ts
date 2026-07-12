import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export class BillingPeriod {
  private constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {}
  public static create(start: Date, end: Date): BillingPeriod {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start)
      throw new InvalidBillingDataError('billingPeriod', 'Periodo de servicio inválido.');
    return new BillingPeriod(new Date(start), new Date(end));
  }
}
