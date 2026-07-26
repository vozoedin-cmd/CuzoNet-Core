import type { RouterConnectionProfile } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { environment } from '../../config/environment.js';
import { LibraryRouterOsClient } from './library-routeros.client.js';

export class SystemRouterOsClientFactory implements RouterOsClientFactoryPort {
  /**
   * `provisioningEnabled` se recibe explícito (con default a la config real) en vez de
   * leerse directamente de `environment` dentro de `create()`. `environment` es un singleton
   * congelado en el momento del import (ver environment.ts), así que un valor leído ahí adentro
   * queda fijo para toda la vida del proceso — imposible de aislar en tests sin reiniciar el
   * módulo. Inyectarlo por constructor permite a producción seguir usando la config real
   * (parámetro por defecto) mientras los tests pasan un valor determinista sin tocar process.env.
   */
  public constructor(
    private readonly provisioningEnabled: boolean = environment.ROUTEROS_PROVISIONING_ENABLED,
  ) {}

  public async create(
    profile: RouterConnectionProfile,
    secret: string,
  ): Promise<RouterOsClientPort> {
    if (!this.provisioningEnabled) {
      throw new Error('ROUTEROS_PROVISIONING_DISABLED');
    }
    return LibraryRouterOsClient.connect(profile, secret);
  }
}
