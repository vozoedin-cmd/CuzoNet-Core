/**
 * La regla de firewall resuelta está marcada `dynamic=true`: la gobierna RouterOS, no
 * CuzoNet. Las generan subsistemas como Hotspot o IPsec, no se guardan en la configuración
 * y desaparecen cuando su origen deja de existir.
 *
 * Puede observarse —el Sync necesita verla— pero no se muta. RouterOS acepta algunos de
 * esos comandos, así que la guarda es una decisión de CuzoNet, no una limitación del
 * router: un `remove` "exitoso" sobre algo efímero informa de un cambio que no perdura, y
 * modificar una regla que su subsistema regenerará convierte el estado deseado en ficción.
 */
export class RouterOsFilterRuleDynamicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsFilterRuleDynamicError';
    Object.setPrototypeOf(this, RouterOsFilterRuleDynamicError.prototype);
  }
}
