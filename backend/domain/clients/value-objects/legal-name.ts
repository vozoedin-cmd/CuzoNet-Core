import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export class LegalName {
  private constructor(public readonly value: string) {}

  public static create(value: string): LegalName {
    const normalizedValue = value.trim();

    if (normalizedValue.length < 2 || normalizedValue.length > 180) {
      throw new InvalidClientDataError('legalName', 'Debe contener entre 2 y 180 caracteres.');
    }

    return new LegalName(normalizedValue);
  }
}
