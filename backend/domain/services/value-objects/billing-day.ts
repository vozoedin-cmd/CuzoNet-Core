import { InvalidServiceDataError } from '../errors/invalid-service-data.error.js';

export class BillingDay {
  private constructor(public readonly value: number) {}

  public static create(value: number): BillingDay {
    if (!Number.isInteger(value) || value < 1 || value > 28) {
      throw new InvalidServiceDataError('billingDay', 'Debe ser un entero entre 1 y 28.');
    }

    return new BillingDay(value);
  }
}
