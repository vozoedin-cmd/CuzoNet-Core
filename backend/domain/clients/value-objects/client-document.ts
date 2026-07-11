import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export class ClientDocument {
  private constructor(
    public readonly type: string,
    public readonly number: string,
  ) {}

  public static create(type: string, number: string): ClientDocument {
    const normalizedType = type.trim();
    const normalizedNumber = number.trim();

    if (normalizedType.length < 1 || normalizedType.length > 32) {
      throw new InvalidClientDataError('documentType', 'Debe contener entre 1 y 32 caracteres.');
    }

    if (normalizedNumber.length < 3 || normalizedNumber.length > 64) {
      throw new InvalidClientDataError('documentNumber', 'Debe contener entre 3 y 64 caracteres.');
    }

    return new ClientDocument(normalizedType, normalizedNumber);
  }

  public get uniquenessKey(): string {
    const normalizedNumber = this.number.replace(/\s+/g, '').toUpperCase();
    return `${this.type.toLowerCase()}:${normalizedNumber}`;
  }
}
