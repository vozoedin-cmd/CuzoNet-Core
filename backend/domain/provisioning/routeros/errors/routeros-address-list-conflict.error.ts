export class RouterOsAddressListConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsAddressListConflictError';
    Object.setPrototypeOf(this, RouterOsAddressListConflictError.prototype);
  }
}
