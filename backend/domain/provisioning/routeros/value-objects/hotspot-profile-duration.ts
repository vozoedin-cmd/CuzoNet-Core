import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const COMPOUND_DURATION = /^(\d+[wdhms])+$/;
const CLOCK_DURATION = /^\d{1,3}:[0-5]\d:[0-5]\d$/;
const NONE = 'none';

/**
 * Duración de un Hotspot User Profile: `session-timeout`, `idle-timeout`,
 * `keepalive-timeout`, `status-autorefresh` y `mac-cookie-timeout`.
 *
 * A diferencia de `HotspotLimitUptime` (propiedad del usuario), estas duraciones
 * admiten además el literal "none". Verificado contra RouterOS 7.21.4: el default de
 * `idle-timeout` es exactamente `"none"`, y `mac-cookie-timeout` usa formato compuesto
 * (`"4w2d"`, `"3d"`).
 */
export class HotspotProfileDuration {
  private constructor(public readonly value: string) {}

  public static create(raw: string, field = 'hotspotProfileDuration'): HotspotProfileDuration {
    const value = raw.trim();
    if (value.toLowerCase() === NONE) {
      return new HotspotProfileDuration(NONE);
    }
    if (!COMPOUND_DURATION.test(value) && !CLOCK_DURATION.test(value)) {
      throw new InvalidProvisioningDataError(
        field,
        `Debe tener el formato RouterOS de duración (p.ej. "1h", "4w2d", "00:30:00") o el literal "${NONE}".`,
      );
    }
    return new HotspotProfileDuration(value);
  }

  public get isNone(): boolean {
    return this.value === NONE;
  }
}
