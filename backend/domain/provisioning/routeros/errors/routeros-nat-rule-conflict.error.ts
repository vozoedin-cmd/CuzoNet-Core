export class RouterOsNatRuleConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsNatRuleConflictError';
    Object.setPrototypeOf(this, RouterOsNatRuleConflictError.prototype);
  }
}
