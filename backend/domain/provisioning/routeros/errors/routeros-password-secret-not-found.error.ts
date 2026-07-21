export class RouterOsPasswordSecretNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsPasswordSecretNotFoundError';
    Object.setPrototypeOf(this, RouterOsPasswordSecretNotFoundError.prototype);
  }
}
