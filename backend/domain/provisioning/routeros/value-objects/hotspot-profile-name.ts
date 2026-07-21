import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class HotspotProfileName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotProfileName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('hotspotProfileName', 'El perfil no puede estar vacío.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotProfileName',
        `El perfil no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotProfileName',
        'El perfil contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotProfileName(value);
  }
}
