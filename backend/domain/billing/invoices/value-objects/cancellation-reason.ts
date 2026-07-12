import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export class CancellationReason {
  private constructor(public readonly value: string) {}
  public static create(value: string): CancellationReason {
    const normalized = value.trim();
    if (normalized.length < 3 || normalized.length > 300)
      throw new InvalidBillingDataError(
        'cancellationReason',
        'Motivo de cancelación no permitido.',
      );
    return new CancellationReason(normalized);
  }
}
