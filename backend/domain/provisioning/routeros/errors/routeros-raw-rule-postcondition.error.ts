/**
 * El router aceptó el comando pero, al releer, el estado resultante no es el que la
 * operación prometía.
 *
 * Solo se comprueba donde la relectura aporta algo que el comando no garantiza por sí mismo:
 * `create` debe dejar exactamente una regla con la referencia Y equivalente a lo pedido, y
 * `remove` debe dejar cero. En `update`, `enable`, `disable` y `move`, el `!done` de RouterOS
 * ya es la confirmación del cambio, y releer duplicaría el coste sin añadir información.
 *
 * Se trata como fallo permanente y no como reintentable a propósito: significa que el modelo
 * que CuzoNet tiene del router y el router mismo han dejado de coincidir, y volver a escribir
 * sobre un router que acaba de comportarse de forma inesperada agrava el problema. Un
 * `create` reintentado a ciegas dejaría dos reglas Raw con la misma referencia, y a partir de
 * ahí toda operación sobre esa referencia sería ambigua.
 */
export class RouterOsRawRulePostconditionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRulePostconditionError';
    Object.setPrototypeOf(this, RouterOsRawRulePostconditionError.prototype);
  }
}
