import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export class ClientNote {
  private constructor(public readonly value: string) {}

  public static create(value: string): ClientNote {
    if (value.length > 2000) {
      throw new InvalidClientDataError('note', 'No puede superar 2000 caracteres.');
    }

    return new ClientNote(value);
  }
}
