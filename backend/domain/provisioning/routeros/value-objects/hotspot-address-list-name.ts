import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 255;
const NO_CONTROL_CHARS = /^[\x20-\x7E]*$/;

/**
 * RouterOS "address-list" de un Hotspot User Profile: la address list a la que se agregan
 * los clientes autenticados con este perfil.
 *
 * Verificado contra RouterOS 7.21.4: el default es la cadena vacía `""`, que significa
 * "ninguna". Por eso se admite explícitamente el vacío, a diferencia de los demás
 * nombres del dominio.
 */
export class HotspotAddressListName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotAddressListName {
    const value = raw.trim();
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'hotspotAddressListName',
        `La address list no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotAddressListName',
        'La address list contiene caracteres de control no permitidos.',
      );
    }
    return new HotspotAddressListName(value);
  }

  public get isEmpty(): boolean {
    return this.value.length === 0;
  }
}
