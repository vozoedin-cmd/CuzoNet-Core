import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const CHAINS = ['srcnat', 'dstnat'] as const;
export type NatChainName = (typeof CHAINS)[number];

/** RouterOS firewall NAT built-in chain: srcnat (outbound translation) or dstnat (inbound translation). */
export class NatChain {
  private constructor(public readonly value: NatChainName) {}

  public static create(raw: string): NatChain {
    const value = raw.trim().toLowerCase();
    if (!(CHAINS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('chain', `Debe ser una de: ${CHAINS.join(', ')}.`);
    }
    return new NatChain(value as NatChainName);
  }
}
