import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class HotspotPassword {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotPassword {
    if (raw.length === 0) {
      throw new InvalidProvisioningDataError('hotspotPassword', 'La contraseña no puede estar vacía.');
    }
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotPassword',
        `La contraseña no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(raw)) {
      throw new InvalidProvisioningDataError(
        'hotspotPassword',
        'La contraseña contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotPassword(raw);
  }
}
