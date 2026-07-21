import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 63;
const VALID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** RouterOS in-interface/out-interface: an interface (or interface-list) name. */
export class InterfaceName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): InterfaceName {
    const value = raw.trim();
    if (value.length === 0 || value.length > MAX_LENGTH || !VALID_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError(
        'interface',
        `Debe ser un nombre de interfaz RouterOS válido (máx. ${MAX_LENGTH} caracteres).`,
      );
    }
    return new InterfaceName(value);
  }
}
