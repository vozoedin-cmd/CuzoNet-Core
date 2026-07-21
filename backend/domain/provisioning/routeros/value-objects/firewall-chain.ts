import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const CHAINS = ['input', 'forward', 'output'] as const;
export type FirewallChainName = (typeof CHAINS)[number];

/**
 * RouterOS firewall filter built-in chain. Custom jump-target chains are out
 * of scope for this adapter — only the three standard filter chains are
 * accepted.
 */
export class FirewallChain {
  private constructor(public readonly value: FirewallChainName) {}

  public static create(raw: string): FirewallChain {
    const value = raw.trim().toLowerCase();
    if (!(CHAINS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('chain', `Debe ser una de: ${CHAINS.join(', ')}.`);
    }
    return new FirewallChain(value as FirewallChainName);
  }
}
