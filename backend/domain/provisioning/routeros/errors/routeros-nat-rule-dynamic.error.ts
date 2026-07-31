/**
 * La regla NAT resuelta está marcada `dynamic=true`: la gobierna RouterOS, no CuzoNet.
 *
 * En NAT este caso es habitual y no meramente defensivo: UPnP crea reglas `dst-nat`
 * dinámicas cada vez que un dispositivo de la LAN solicita un mapeo de puerto. No se
 * guardan en la configuración y desaparecen cuando su origen deja de renovarlas.
 *
 * Pueden observarse —el Sync necesita verlas— pero no se mutan. Modificar un mapeo que
 * UPnP regenerará convierte el estado deseado en ficción, y un `remove` "exitoso" informa
 * de un cambio que no perdura.
 */
export class RouterOsNatRuleDynamicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsNatRuleDynamicError';
    Object.setPrototypeOf(this, RouterOsNatRuleDynamicError.prototype);
  }
}
