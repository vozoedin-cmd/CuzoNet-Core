import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

/** RouterOS "shared-users", how many concurrent sessions the user may open. */
export class HotspotSharedUsers {
  private constructor(public readonly value: number) {}

  public static create(raw: number): HotspotSharedUsers {
    if (!Number.isInteger(raw) || raw < 1) {
      throw new InvalidProvisioningDataError(
        'hotspotSharedUsers',
        'Debe ser un entero mayor o igual a uno.',
      );
    }
    return new HotspotSharedUsers(raw);
  }
}
