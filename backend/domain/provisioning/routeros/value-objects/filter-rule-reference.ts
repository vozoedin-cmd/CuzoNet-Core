import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const MAX_LENGTH = 128;
const VALID_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Stable business identifier for a RouterOS firewall filter rule. Embedded in
 * the rule's comment marker (see FilterRuleComment) so identity never
 * depends on RouterOS's mutable ".id", which can change after exports,
 * restores or recreations.
 */
export class FilterRuleReference {
  private constructor(public readonly value: string) {}

  public static create(raw: string): FilterRuleReference {
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
    return new FilterRuleReference(value);
  }
}
