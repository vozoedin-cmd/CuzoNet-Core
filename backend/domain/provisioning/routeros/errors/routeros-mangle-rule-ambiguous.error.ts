/**
 * La referencia administrada resolvió a más de una regla Mangle.
 *
 * El marcador `cuzonet:firewall-mangle:<ruleReference>` identifica una sola regla, pero
 * RouterOS no impone esa unicidad: una duplicación manual desde WinBox o una importación
 * de configuración pueden dejar dos.
 *
 * Ante la ambigüedad no se opera. En Mangle elegir la primera es especialmente dañino
 * porque el marcado depende de la POSICIÓN: dos reglas gemelas `mark-connection` con
 * `passthrough=false` significan que la segunda nunca se evalúa, y mover, deshabilitar o
 * eliminar solo una de ellas cambia qué tráfico queda marcado sin que el sistema lo
 * refleje. Peor aún, una marca es la entrada de las colas y del enrutamiento por marca:
 * un cambio parcial se manifiesta como tráfico mal encolado o saliendo por el ISP
 * equivocado, lejos de la operación que lo causó.
 */
export class RouterOsMangleRuleAmbiguousError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsMangleRuleAmbiguousError';
    Object.setPrototypeOf(this, RouterOsMangleRuleAmbiguousError.prototype);
  }
}
