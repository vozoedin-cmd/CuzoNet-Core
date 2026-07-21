import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const CHAINS = ['prerouting', 'input', 'forward', 'output', 'postrouting'] as const;
export type MangleChainName = (typeof CHAINS)[number];

/** RouterOS firewall Mangle built-in chain. Mangle exposes all five standard chains (unlike Filter's three or NAT's two). */
export class MangleChain {
  private constructor(public readonly value: MangleChainName) {}

  public static create(raw: string): MangleChain {
    const value = raw.trim().toLowerCase();
    if (!(CHAINS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('chain', `Debe ser una de: ${CHAINS.join(', ')}.`);
    }
    return new MangleChain(value as MangleChainName);
  }
}
