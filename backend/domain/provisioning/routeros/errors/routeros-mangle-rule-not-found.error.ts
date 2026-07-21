export class RouterOsMangleRuleNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsMangleRuleNotFoundError';
    Object.setPrototypeOf(this, RouterOsMangleRuleNotFoundError.prototype);
  }
}
