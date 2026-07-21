export class RouterOsMangleRuleConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsMangleRuleConflictError';
    Object.setPrototypeOf(this, RouterOsMangleRuleConflictError.prototype);
  }
}
