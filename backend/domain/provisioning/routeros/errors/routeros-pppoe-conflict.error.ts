export class RouterOsPppoeConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsPppoeConflictError';
    Object.setPrototypeOf(this, RouterOsPppoeConflictError.prototype);
  }
}
