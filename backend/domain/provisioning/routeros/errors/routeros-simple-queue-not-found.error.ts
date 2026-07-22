export class RouterOsSimpleQueueNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsSimpleQueueNotFoundError';
    Object.setPrototypeOf(this, RouterOsSimpleQueueNotFoundError.prototype);
  }
}
