import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

/** Una tasa RouterOS: dígitos con sufijo opcional k/M/G (p.ej. "512k", "5M"). */
const RATE = /^\d+[kKmMgG]?$/;

/**
 * RouterOS "rate-limit" de un Hotspot User Profile, en la forma `RX/TX`
 * (bajada/subida desde la perspectiva del cliente).
 *
 * Verificado contra RouterOS 7.21.4: el perfil `E2E_TEST` reporta `"5M/5M"`, y `add`
 * preserva literalmente `"5M/10M"`. RouterOS admite formas extendidas con burst
 * (`rx/tx rx-burst/tx-burst ...`); esta primera versión cubre solo el par simple, que
 * es lo que el resto del proyecto ya modela para Simple Queue.
 */
export class HotspotRateLimit {
  private constructor(
    public readonly value: string,
    public readonly rx: string,
    public readonly tx: string,
  ) {}

  public static create(raw: string): HotspotRateLimit {
    const value = raw.trim();
    const parts = value.split('/');
    if (parts.length !== 2) {
      throw new InvalidProvisioningDataError(
        'hotspotRateLimit',
        'Debe tener el formato "RX/TX" (p.ej. "5M/10M").',
      );
    }
    const [rx, tx] = parts;
    if (rx === undefined || tx === undefined || !RATE.test(rx) || !RATE.test(tx)) {
      throw new InvalidProvisioningDataError(
        'hotspotRateLimit',
        'Cada tasa debe ser un entero con sufijo opcional k/M/G (p.ej. "512k", "5M").',
      );
    }
    return new HotspotRateLimit(`${rx}/${tx}`, rx, tx);
  }
}
