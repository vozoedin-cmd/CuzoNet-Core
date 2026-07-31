/**
 * La regla NAT resuelta no pertenece a CuzoNet, o su marcador de propiedad no es legible.
 *
 * Hoy esta situación es inalcanzable por construcción: `NatRuleComment.parseOwnership` solo
 * adjunta `ruleReference` al estado `valid`, y todas las operaciones resuelven por esa
 * referencia, así que las reglas `foreign`, `malformed` y `unmanaged` no aparecen.
 *
 * Esta guarda existe para que esa propiedad deje de ser emergente y pase a ser exigida: si
 * alguna vez la resolución se afloja —una búsqueda por chain+action, una coincidencia
 * aproximada, un locator por `.id`—, la regla ajena se rechaza en lugar de mutarse en
 * silencio. En NAT eso importa especialmente: una regla `masquerade` de salida o un
 * `dst-nat` que otro sistema administra son cosas que nadie quiere ver modificadas por
 * error.
 *
 * `malformed` se rechaza igual. Repararla significaría reescribir su comentario para
 * reclamar su propiedad, y esa es una decisión de producto que el dominio no ha tomado.
 */
export class RouterOsNatRuleOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsNatRuleOwnershipError';
    Object.setPrototypeOf(this, RouterOsNatRuleOwnershipError.prototype);
  }
}
