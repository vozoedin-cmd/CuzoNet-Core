export class RouterOsInvalidFilterRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsInvalidFilterRuleError';
    Object.setPrototypeOf(this, RouterOsInvalidFilterRuleError.prototype);
  }
}
