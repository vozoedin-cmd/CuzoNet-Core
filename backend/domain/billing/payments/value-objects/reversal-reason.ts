import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export class ReversalReason {
  private constructor(public readonly value: string) {}
  public static create(value: string): ReversalReason {
    const normalized = value.trim();
    if (normalized.length < 3 || normalized.length > 300)
      throw new InvalidBillingDataError('reversalReason', 'Motivo de reversión no permitido.');
    return new ReversalReason(normalized);
  }
}
