export class RouterConnectionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterConnectionError';
    Object.setPrototypeOf(this, RouterConnectionError.prototype);
  }
}
