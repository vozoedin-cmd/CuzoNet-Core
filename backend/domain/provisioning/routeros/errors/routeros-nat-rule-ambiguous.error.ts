/**
 * La referencia administrada resolvió a más de una regla NAT.
 *
 * El marcador `cuzonet:firewall-nat:<ruleReference>` identifica una sola regla, pero
 * RouterOS no impone esa unicidad: una duplicación manual desde WinBox o una importación
 * de configuración pueden dejar dos.
 *
 * Ante la ambigüedad no se opera. En NAT las consecuencias de elegir la primera son
 * particularmente malas: eliminar una de dos reglas `dst-nat` gemelas deja el reenvío de
 * puerto vivo mientras el sistema informa de que se cerró, y deshabilitar solo una de dos
 * `masquerade` deja la salida a Internet funcionando cuando se pidió cortarla.
 */
export class RouterOsNatRuleAmbiguousError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsNatRuleAmbiguousError';
    Object.setPrototypeOf(this, RouterOsNatRuleAmbiguousError.prototype);
  }
}
