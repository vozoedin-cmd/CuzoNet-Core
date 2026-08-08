/** No existe ninguna regla Raw con la referencia administrada solicitada. */
export class RouterOsRawRuleNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRuleNotFoundError';
    Object.setPrototypeOf(this, RouterOsRawRuleNotFoundError.prototype);
  }
}
