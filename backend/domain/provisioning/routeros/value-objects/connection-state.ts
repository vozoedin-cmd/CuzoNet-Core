import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const STATES = ['new', 'established', 'related', 'invalid', 'untracked'] as const;

/** RouterOS firewall filter connection-state: a comma-separated list of connection-tracking states. */
export class ConnectionState {
  private constructor(public readonly value: string) {}

  public static create(raw: string): ConnectionState {
    const tokens = raw
      .trim()
      .split(',')
      .map((token) => token.trim().toLowerCase());
    if (tokens.length === 0 || tokens.some((token) => !(STATES as readonly string[]).includes(token))) {
      throw new InvalidProvisioningDataError(
        'connectionState',
        `Debe ser una lista separada por comas de: ${STATES.join(', ')}.`,
      );
    }
    return new ConnectionState(tokens.join(','));
  }
}
