/**
 * La referencia administrada resolvió a más de una regla Raw.
 *
 * El marcador `cuzonet:firewall-raw:<ruleReference>` identifica una sola regla, pero
 * RouterOS no impone esa unicidad: una duplicación manual desde WinBox o una importación de
 * configuración pueden dejar dos.
 *
 * Ante la ambigüedad no se opera. En Raw las consecuencias de elegir la primera son
 * particularmente malas porque estas reglas deciden qué tráfico ENTRA al connection
 * tracking: eliminar una de dos `notrack` gemelas —o de dos `drop` de bogons— deja pasando
 * un tráfico que el sistema informa como bloqueado, y la evaluación es posicional, así que
 * ni siquiera la segunda copia se comporta igual que la primera.
 */
export class RouterOsRawRuleAmbiguousError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRuleAmbiguousError';
    Object.setPrototypeOf(this, RouterOsRawRuleAmbiguousError.prototype);
  }
}
