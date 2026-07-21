import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const COMPOUND_DURATION = /^(\d+[wdhms])+$/;
const CLOCK_DURATION = /^\d{1,3}:[0-5]\d:[0-5]\d$/;
const NONE = 'none';

/** RouterOS firewall address-list "timeout": a duration (e.g. "1d", "00:30:00") or "none" for a permanent entry. */
export class Timeout {
  private constructor(public readonly value: string) {}

  public static create(raw: string): Timeout {
    const value = raw.trim();
    if (value.toLowerCase() === NONE) {
      return new Timeout(NONE);
    }
    if (!COMPOUND_DURATION.test(value) && !CLOCK_DURATION.test(value)) {
      throw new InvalidProvisioningDataError(
        'timeout',
        'Debe ser "none" o tener el formato RouterOS de duración (p.ej. "1d", "4h30m" o "00:30:00").',
      );
    }
    return new Timeout(value);
  }

  public isPermanent(): boolean {
    return this.value === NONE;
  }
}
