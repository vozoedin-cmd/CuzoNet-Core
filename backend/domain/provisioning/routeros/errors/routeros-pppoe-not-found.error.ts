export class RouterOsPppoeNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsPppoeNotFoundError';
    Object.setPrototypeOf(this, RouterOsPppoeNotFoundError.prototype);
  }
}
