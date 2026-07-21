export class RouterOsHotspotConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotConflictError';
    Object.setPrototypeOf(this, RouterOsHotspotConflictError.prototype);
  }
}
