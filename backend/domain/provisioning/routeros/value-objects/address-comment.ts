import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class AddressComment {
  private constructor(public readonly value: string) {}

  public static create(raw: string): AddressComment {
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'addressComment',
        `El comentario no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(raw)) {
      throw new InvalidProvisioningDataError(
        'addressComment',
        'El comentario contiene caracteres de control no permitidos.',
      );
    }
    return new AddressComment(raw);
  }
}
