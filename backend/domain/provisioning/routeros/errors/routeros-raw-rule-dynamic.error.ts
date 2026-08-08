/**
 * La regla Raw resuelta es `dynamic=true`: la gobierna RouterOS, no CuzoNet.
 *
 * No se guarda en la configuración persistente y desaparecerá sola, así que mutarla
 * informaría de un cambio que no perdura. La guarda corta antes de enviar comando alguno al
 * router: la regla se puede observar, solo no mutar.
 *
 * La sonda de la Fase 0-bis encontró la tabla vacía y sin reglas dinámicas, así que el campo
 * está modelado sobre lo que el router materializa —llegó `dynamic=false` en el 100% de las
 * filas de sonda— pero el escenario dinámico en Raw no se ha observado en vivo.
 */
export class RouterOsRawRuleDynamicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRuleDynamicError';
    Object.setPrototypeOf(this, RouterOsRawRuleDynamicError.prototype);
  }
}
