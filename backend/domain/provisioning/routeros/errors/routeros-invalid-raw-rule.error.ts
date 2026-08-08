/**
 * La regla Raw solicitada no es válida como configuración.
 *
 * Cubre la coherencia acción/acompañante que el esquema no puede juzgar por sí solo: en un
 * `update`, la acción resultante puede venir del payload y su campo acompañante de la regla
 * que ya está en el router, así que solo se puede decidir con el estado observado delante.
 *
 * También recoge los rechazos del propio router que llegan como `!trap` y son de validación:
 * una acción inexistente o un parámetro que Raw no tiene.
 */
export class RouterOsInvalidRawRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsInvalidRawRuleError';
    Object.setPrototypeOf(this, RouterOsInvalidRawRuleError.prototype);
  }
}
