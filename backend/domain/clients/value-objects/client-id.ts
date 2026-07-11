import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ClientId {
  private constructor(public readonly value: string) {}

  public static create(value: string): ClientId {
    const normalizedValue = value.toLowerCase();

    if (!UUID_PATTERN.test(normalizedValue)) {
      throw new InvalidClientDataError('clientId', 'Debe ser un UUID válido.');
    }

    return new ClientId(normalizedValue);
  }
}
