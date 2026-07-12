import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ClientBillingReferenceId {
  private constructor(public readonly value: string) {}

  public static create(value: string): ClientBillingReferenceId {
    const normalized = value.toLowerCase();
    if (!UUID_PATTERN.test(normalized))
      throw new InvalidBillingDataError('clientId', 'Debe ser un UUID válido.');
    return new ClientBillingReferenceId(normalized);
  }
}
