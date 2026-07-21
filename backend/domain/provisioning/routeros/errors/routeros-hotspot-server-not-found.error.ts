export class RouterOsHotspotServerNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotServerNotFoundError';
    Object.setPrototypeOf(this, RouterOsHotspotServerNotFoundError.prototype);
  }
}
