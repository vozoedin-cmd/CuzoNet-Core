export class RouterOsHotspotProfileNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotProfileNotFoundError';
    Object.setPrototypeOf(this, RouterOsHotspotProfileNotFoundError.prototype);
  }
}
