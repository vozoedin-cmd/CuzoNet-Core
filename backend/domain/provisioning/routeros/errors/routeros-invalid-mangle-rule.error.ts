export class RouterOsInvalidMangleRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsInvalidMangleRuleError';
    Object.setPrototypeOf(this, RouterOsInvalidMangleRuleError.prototype);
  }
}
