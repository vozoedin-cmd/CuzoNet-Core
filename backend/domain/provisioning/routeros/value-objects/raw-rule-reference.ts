import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 128;
const VALID_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Identificador de negocio estable de una regla de `/ip/firewall/raw`. Va embebido en el
 * marcador del comentario (ver RawRuleComment) para que la identidad no dependa nunca del
 * `.id` mutable de RouterOS, que cambia tras exportar, restaurar o recrear.
 *
 * El patrón excluye el espacio a propósito: `parseOwnership` recupera la referencia como el
 * token hasta el primer espacio, así que una referencia con espacios sería irrecuperable.
 */
export class RawRuleReference {
  private constructor(public readonly value: string) {}

  public static create(raw: string): RawRuleReference {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidProvisioningDataError('ruleReference', 'La referencia de la regla no puede estar vacía.');
    }
    if (value.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'ruleReference',
        `La referencia de la regla no puede exceder los ${MAX_LENGTH} caracteres.`,
      );
    }
    if (!VALID_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError(
        'ruleReference',
        'La referencia de la regla solo puede contener letras, números, guiones, guiones bajos y puntos.',
      );
    }
    return new RawRuleReference(value);
  }
}
