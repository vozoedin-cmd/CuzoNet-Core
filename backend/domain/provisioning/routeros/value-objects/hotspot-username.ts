import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 64;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class HotspotUsername {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotUsername {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('hotspotUsername', 'El nombre de usuario no puede estar vacío.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotUsername',
        `El nombre de usuario no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotUsername',
        'El nombre de usuario contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotUsername(value);
  }
}
