import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export const clientTypes = ['person', 'company'] as const;
export type ClientTypeValue = (typeof clientTypes)[number];

export class ClientType {
  private constructor(public readonly value: ClientTypeValue) {}

  public static create(value: string): ClientType {
    if (!clientTypes.some((clientType) => clientType === value)) {
      throw new InvalidClientDataError('clientType', 'Debe ser person o company.');
    }

    return new ClientType(value as ClientTypeValue);
  }
}
