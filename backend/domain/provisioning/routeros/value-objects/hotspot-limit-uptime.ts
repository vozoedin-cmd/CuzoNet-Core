import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const COMPOUND_DURATION = /^(\d+[wdhms])+$/;
const CLOCK_DURATION = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

/** RouterOS "limit-uptime" duration, e.g. "1d", "4h30m" or "00:30:00". */
export class HotspotLimitUptime {
  private constructor(public readonly value: string) {}

  public static create(raw: string): HotspotLimitUptime {
    const value = raw.trim();
    if (!COMPOUND_DURATION.test(value) && !CLOCK_DURATION.test(value)) {
      throw new InvalidProvisioningDataError(
        'hotspotLimitUptime',
        'Debe tener el formato RouterOS de duración (p.ej. "1d", "4h30m" o "00:30:00").',
      );
    }
    return new HotspotLimitUptime(value);
  }
}
