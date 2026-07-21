import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

/** Desired zero-based position of a filter rule within the router's global firewall filter rule order. */
export class FilterRulePosition {
  private constructor(public readonly value: number) {}

  public static create(raw: number): FilterRulePosition {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new InvalidProvisioningDataError('position', 'La posición debe ser un entero mayor o igual a cero.');
    }
    return new FilterRulePosition(raw);
  }
}
