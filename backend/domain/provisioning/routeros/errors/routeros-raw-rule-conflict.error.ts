/** Ya existe una regla Raw con la referencia administrada y una configuración distinta. */
export class RouterOsRawRuleConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRuleConflictError';
    Object.setPrototypeOf(this, RouterOsRawRuleConflictError.prototype);
  }
}
