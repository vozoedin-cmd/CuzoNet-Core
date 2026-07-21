import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 64;
const VALID_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * RouterOS firewall Mangle connection/packet/routing mark name. Used both
 * to match an existing mark (connection-mark, packet-mark, routing-mark)
 * and to set a new one (new-connection-mark, new-packet-mark,
 * new-routing-mark) — the same free-form tag syntax applies to both.
 */
export class MangleMarkName {
  private constructor(public readonly value: string) {}

  public static create(raw: string): MangleMarkName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('mark', 'El nombre de la marca no puede estar vacío.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError('mark', `El nombre de la marca no puede exceder los ${MAX_LENGTH} caracteres.`);
    }
    if (!VALID_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError(
        'mark',
        'El nombre de la marca solo puede contener letras, números, guiones, guiones bajos y puntos.',
      );
    }
    return new MangleMarkName(value);
  }
}
