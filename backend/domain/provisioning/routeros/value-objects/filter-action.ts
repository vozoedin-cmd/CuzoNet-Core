import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const ACTIONS = ['accept', 'drop', 'reject', 'log', 'passthrough'] as const;
export type FilterActionName = (typeof ACTIONS)[number];

/**
 * RouterOS firewall filter action. Actions that require extra parameters
 * (jump/return with jump-target, tarpit, etc.) are out of scope for this
 * adapter.
 */
export class FilterAction {
  private constructor(public readonly value: FilterActionName) {}

  public static create(raw: string): FilterAction {
    const value = raw.trim().toLowerCase();
    if (!(ACTIONS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('action', `Debe ser una de: ${ACTIONS.join(', ')}.`);
    }
    return new FilterAction(value as FilterActionName);
  }
}
