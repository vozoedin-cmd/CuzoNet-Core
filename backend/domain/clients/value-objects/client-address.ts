import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export interface ClientAddressPrimitives {
  addressLine: string;
  isServiceAddress: boolean;
  label?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
}

export class ClientAddress {
  private constructor(
    public readonly addressLine: string,
    public readonly isServiceAddress: boolean,
    public readonly label: string | undefined,
    public readonly latitude: number | undefined,
    public readonly longitude: number | undefined,
  ) {}

  public static create(input: ClientAddressPrimitives): ClientAddress {
    const addressLine = input.addressLine.trim();
    const label = input.label?.trim();

    if (addressLine.length < 1 || addressLine.length > 300) {
      throw new InvalidClientDataError(
        'addresses.addressLine',
        'Debe contener entre 1 y 300 caracteres.',
      );
    }

    if (label !== undefined && label.length > 80) {
      throw new InvalidClientDataError('addresses.label', 'No puede superar 80 caracteres.');
    }

    if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
      throw new InvalidClientDataError('addresses.latitude', 'Debe estar entre -90 y 90.');
    }

    if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
      throw new InvalidClientDataError('addresses.longitude', 'Debe estar entre -180 y 180.');
    }

    return new ClientAddress(
      addressLine,
      input.isServiceAddress,
      label,
      input.latitude,
      input.longitude,
    );
  }

  public toPrimitives(): ClientAddressPrimitives {
    return {
      addressLine: this.addressLine,
      isServiceAddress: this.isServiceAddress,
      ...(this.label === undefined ? {} : { label: this.label }),
      ...(this.latitude === undefined ? {} : { latitude: this.latitude }),
      ...(this.longitude === undefined ? {} : { longitude: this.longitude }),
    };
  }
}
