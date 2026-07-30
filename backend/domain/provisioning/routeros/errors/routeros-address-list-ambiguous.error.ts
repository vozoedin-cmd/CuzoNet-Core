/**
 * La clave natural `list`+`address` resolvió a más de una entrada.
 *
 * RouterOS 7.21.4 rechaza crear un duplicado (`already have such entry`), así que este
 * estado no lo produce el aprovisionamiento: llega por una configuración importada o
 * creada con una versión anterior. El router de laboratorio tiene un caso real, dos
 * entradas `MOROSOS`/`192.168.13.254` creadas con siete horas de diferencia.
 *
 * Ante la ambigüedad no se opera: elegir una arbitrariamente significaría, por ejemplo,
 * eliminar la primera, informar éxito y dejar la segunda activa en el firewall.
 */
export class RouterOsAddressListAmbiguousError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsAddressListAmbiguousError';
    Object.setPrototypeOf(this, RouterOsAddressListAmbiguousError.prototype);
  }
}
