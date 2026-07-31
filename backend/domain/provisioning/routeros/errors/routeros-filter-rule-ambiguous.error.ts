/**
 * La referencia administrada resolvió a más de una regla de firewall.
 *
 * El marcador `cuzonet:firewall-filter:<ruleReference>` está pensado para identificar una
 * sola regla, pero RouterOS no impone esa unicidad: nada le impide a un operador duplicar
 * una regla desde WinBox, ni a una importación de configuración traer dos copias.
 *
 * Ante la ambigüedad no se opera. Quedarse con la primera coincidencia significaría, por
 * ejemplo, deshabilitar una regla de bloqueo e informar éxito mientras la gemela sigue
 * activa —o, al revés, eliminar solo una de dos reglas que abren un puerto—. En ambos
 * casos el estado del firewall no sería el que la solicitud pidió y nadie se enteraría.
 */
export class RouterOsFilterRuleAmbiguousError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsFilterRuleAmbiguousError';
    Object.setPrototypeOf(this, RouterOsFilterRuleAmbiguousError.prototype);
  }
}
