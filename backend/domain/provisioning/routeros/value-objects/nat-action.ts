import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';
import type { NatChainName } from './nat-chain.js';

const ACTIONS = ['masquerade', 'src-nat', 'dst-nat', 'netmap', 'redirect'] as const;
export type NatActionName = (typeof ACTIONS)[number];

const CHAIN_ACTIONS: Record<NatChainName, readonly NatActionName[]> = {
  dstnat: ['dst-nat', 'redirect', 'netmap'],
  srcnat: ['masquerade', 'src-nat', 'netmap'],
};

/** RouterOS firewall NAT action addressed by this adapter. Actions not tied to address/port translation (accept, jump, log, ...) are out of scope. */
export class NatAction {
  private constructor(public readonly value: NatActionName) {}

  public static create(raw: string): NatAction {
    const value = raw.trim().toLowerCase();
    if (!(ACTIONS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('action', `Debe ser una de: ${ACTIONS.join(', ')}.`);
    }
    return new NatAction(value as NatActionName);
  }

  /** RouterOS only allows each NAT action on its matching chain (e.g. masquerade is srcnat-only, redirect is dstnat-only). */
  public isCompatibleWith(chain: NatChainName): boolean {
    return CHAIN_ACTIONS[chain].includes(this.value);
  }

  /** dst-nat/src-nat/netmap translate to another address and require to-addresses; masquerade/redirect do not. */
  public requiresToAddresses(): boolean {
    return this.value === 'dst-nat' || this.value === 'src-nat' || this.value === 'netmap';
  }
}
