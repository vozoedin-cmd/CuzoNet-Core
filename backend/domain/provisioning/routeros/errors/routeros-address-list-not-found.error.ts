export class RouterOsAddressListNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsAddressListNotFoundError';
    Object.setPrototypeOf(this, RouterOsAddressListNotFoundError.prototype);
  }
}
