export class RouterOsInvalidAddressError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsInvalidAddressError';
    Object.setPrototypeOf(this, RouterOsInvalidAddressError.prototype);
  }
}
