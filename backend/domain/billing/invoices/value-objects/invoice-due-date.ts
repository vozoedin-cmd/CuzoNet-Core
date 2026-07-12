import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';

export class InvoiceDueDate {
  private constructor(public readonly value: Date) {}

  public static create(value: Date, issuedOn: Date): InvoiceDueDate {
    if (Number.isNaN(value.getTime()) || Number.isNaN(issuedOn.getTime()) || value < issuedOn)
      throw new InvalidBillingDataError('dueOn', 'La fecha de vencimiento no es válida.');
    return new InvoiceDueDate(new Date(value));
  }
}
