export class RouterOsHotspotUserNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotUserNotFoundError';
    Object.setPrototypeOf(this, RouterOsHotspotUserNotFoundError.prototype);
  }
}
