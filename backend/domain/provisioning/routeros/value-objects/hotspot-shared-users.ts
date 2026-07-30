import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const UNLIMITED = 'unlimited';

/**
 * RouterOS "shared-users" de un Hotspot User Profile: cuántas sesiones simultáneas
 * admite un usuario del perfil.
 *
 * Admite un entero >= 1 o el literal "unlimited". Verificado contra RouterOS 7.21.4:
 * el perfil `default` reporta `shared-users = "unlimited"`, y `add`/`set` aceptan ese
 * literal tal cual. Modelarlo solo como número haría fallar cualquier perfil sin límite.
 *
 * Pertenece al PERFIL, no al usuario: enviarlo en /ip/hotspot/user provoca
 * "unknown parameter shared-users".
 */
export class HotspotSharedUsers {
  private constructor(public readonly value: number | typeof UNLIMITED) {}

  public static create(raw: number | string): HotspotSharedUsers {
    if (typeof raw === 'string') {
      const value = raw.trim().toLowerCase();
      if (value !== UNLIMITED) {
        throw new InvalidProvisioningDataError(
          'hotspotSharedUsers',
          `Debe ser un entero mayor o igual a uno, o el literal "${UNLIMITED}".`,
        );
      }
      return new HotspotSharedUsers(UNLIMITED);
    }
    if (!Number.isInteger(raw)) {
      throw new InvalidProvisioningDataError('hotspotSharedUsers', 'Debe ser un entero.');
    }
    if (raw < 1) {
      throw new InvalidProvisioningDataError('hotspotSharedUsers', 'Debe ser mayor o igual a uno.');
    }
    return new HotspotSharedUsers(raw);
  }

  public get isUnlimited(): boolean {
    return this.value === UNLIMITED;
  }

  /** Representación exacta que espera RouterOS en add/set. */
  public toRouterOs(): string {
    return String(this.value);
  }
}
