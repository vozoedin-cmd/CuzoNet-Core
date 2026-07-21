export class RouterOsNatRuleNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsNatRuleNotFoundError';
    Object.setPrototypeOf(this, RouterOsNatRuleNotFoundError.prototype);
  }
}
