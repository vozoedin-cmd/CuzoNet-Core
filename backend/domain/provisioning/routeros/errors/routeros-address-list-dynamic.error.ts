/**
 * Una entrada de address-list marcada `dynamic=true` la genera y la gobierna RouterOS
 * (reglas `add-src-to-address-list`, resolución de nombres de dominio, entradas con
 * `timeout`). No se persiste en la configuración, no sobrevive a un reinicio y RouterOS
 * rechaza deshabilitarla (`cannot have disabled dynamic entry`), así que no puede formar
 * parte del estado deseado que administra CuzoNet.
 */
export class RouterOsAddressListDynamicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsAddressListDynamicError';
    Object.setPrototypeOf(this, RouterOsAddressListDynamicError.prototype);
  }
}
