export class RouterOsHotspotUserProfileNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotUserProfileNotFoundError';
    Object.setPrototypeOf(this, RouterOsHotspotUserProfileNotFoundError.prototype);
  }
}
