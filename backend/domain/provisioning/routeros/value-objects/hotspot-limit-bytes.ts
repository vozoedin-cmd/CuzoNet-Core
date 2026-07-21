import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

/** RouterOS "limit-bytes-total", total traffic quota for the user, in bytes. */
export class HotspotLimitBytes {
  private constructor(public readonly value: number) {}

  public static create(raw: number): HotspotLimitBytes {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new InvalidProvisioningDataError(
        'hotspotLimitBytes',
        'Debe ser un entero mayor o igual a cero.',
      );
    }
    return new HotspotLimitBytes(raw);
  }
}
