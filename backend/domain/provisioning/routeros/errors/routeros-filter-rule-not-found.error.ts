export class RouterOsFilterRuleNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsFilterRuleNotFoundError';
    Object.setPrototypeOf(this, RouterOsFilterRuleNotFoundError.prototype);
  }
}
