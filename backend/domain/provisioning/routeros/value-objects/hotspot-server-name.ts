import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class HotspotServerName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotServerName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('hotspotServerName', 'El servidor no puede estar vacío.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotServerName',
        `El servidor no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotServerName',
        'El servidor contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotServerName(value);
  }
}
