import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

export class HotspotComment {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotComment {
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotComment',
        `El comentario no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(raw)) {
      throw new InvalidProvisioningDataError(
        'hotspotComment',
        'El comentario contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotComment(raw);
  }
}
