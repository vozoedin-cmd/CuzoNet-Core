export class RouterOsHotspotUserProfileConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotUserProfileConflictError';
    Object.setPrototypeOf(this, RouterOsHotspotUserProfileConflictError.prototype);
  }
}
