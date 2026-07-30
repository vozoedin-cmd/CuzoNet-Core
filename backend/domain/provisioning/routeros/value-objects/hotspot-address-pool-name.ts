import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;
const NONE = 'none';

/**
 * RouterOS "address-pool" de un Hotspot User Profile: el IP pool desde el que se
 * asignan direcciones, o el literal "none".
 *
 * Verificado contra RouterOS 7.21.4: `add address-pool=none` es aceptado y el campo
 * simplemente no vuelve en el `print` (equivale a "sin pool"), mientras que un pool
 * real se reporta por nombre (`"POOL-HOTSPOT"`).
 */
export class HotspotAddressPoolName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotAddressPoolName {
    const value = raw.trim();
    if (value.toLowerCase() === NONE) {
      return new HotspotAddressPoolName(NONE);
    }
    if (value.length === 0) {
      throw new InvalidProvisioningDataError(
        'hotspotAddressPoolName',
        `El pool no puede estar vacío; use "${NONE}" para no asignar ninguno.`,
      );
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotAddressPoolName',
        `El pool no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotAddressPoolName',
        'El pool contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotAddressPoolName(value);
  }

  public get isNone(): boolean {
    return this.value === NONE;
  }
}
