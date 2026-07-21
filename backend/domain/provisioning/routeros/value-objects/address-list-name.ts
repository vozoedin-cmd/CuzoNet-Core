import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 64;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class AddressListName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): AddressListName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('addressListName', 'El nombre de la lista no puede estar vacío.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'addressListName',
        `El nombre de la lista no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'addressListName',
        'El nombre de la lista contiene caracteres de control no permitidos.',
      );
    }
    return new AddressListName(value);
  }
}
