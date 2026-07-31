/**
 * La regla resuelta no pertenece a CuzoNet, o su marcador de propiedad no es legible.
 *
 * Hoy esta situación es inalcanzable por construcción: `FilterRuleComment.parseOwnership`
 * solo adjunta `ruleReference` al estado `valid`, y todas las operaciones resuelven por esa
 * referencia, así que las reglas `foreign`, `malformed` y `unmanaged` sencillamente no
 * aparecen. Esta guarda existe para que esa propiedad deje de ser emergente y pase a ser
 * exigida: si alguna vez la resolución se afloja —una búsqueda por chain+action, una
 * coincidencia aproximada, un locator por `.id`—, la regla ajena se rechaza en lugar de
 * mutarse en silencio.
 *
 * `malformed` se rechaza igual que `foreign` y `unmanaged`. Repararla significaría
 * reescribir su comentario para reclamar su propiedad, y esa es una decisión de producto
 * que el dominio todavía no ha tomado.
 */
export class RouterOsFilterRuleOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsFilterRuleOwnershipError';
    Object.setPrototypeOf(this, RouterOsFilterRuleOwnershipError.prototype);
  }
}
