export class RouterOsFilterRuleConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsFilterRuleConflictError';
    Object.setPrototypeOf(this, RouterOsFilterRuleConflictError.prototype);
  }
}
