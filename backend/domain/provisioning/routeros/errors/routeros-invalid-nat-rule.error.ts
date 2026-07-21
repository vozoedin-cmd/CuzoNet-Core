export class RouterOsInvalidNatRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsInvalidNatRuleError';
    Object.setPrototypeOf(this, RouterOsInvalidNatRuleError.prototype);
  }
}
