export class RouterOsSimpleQueueConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsSimpleQueueConflictError';
  }
}
