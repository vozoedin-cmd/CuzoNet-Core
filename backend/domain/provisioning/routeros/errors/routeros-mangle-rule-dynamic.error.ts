/**
 * La regla Mangle resuelta es `dynamic=true`: la gobierna RouterOS, no CuzoNet.
 *
 * En `/ip/firewall/mangle` las dinámicas las generan otros subsistemas del router — el
 * más común es la marca que instala una cola con `dynamic` o una regla derivada de otra
 * configuración. No se guardan en la configuración persistente y desaparecerán solas, así
 * que mutarlas informaría de un cambio que no perdura.
 *
 * La guarda corta antes de enviar comando alguno al router: la regla se puede observar,
 * solo no mutar.
 */
export class RouterOsMangleRuleDynamicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsMangleRuleDynamicError';
    Object.setPrototypeOf(this, RouterOsMangleRuleDynamicError.prototype);
  }
}
