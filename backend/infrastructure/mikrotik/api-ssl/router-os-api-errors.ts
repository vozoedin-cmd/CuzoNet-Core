export type RouterOsFailureClassification = 'PERMANENT' | 'RETRYABLE';

export class RouterOsTransportError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RouterOsTransportError';
  }
}

export class RouterOsTrapError extends Error {
  public constructor(
    public readonly category: string | undefined,
    public readonly classification: RouterOsFailureClassification,
    message: string,
  ) {
    super(message);
    this.name = 'RouterOsTrapError';
  }
}

export class UnknownTrap extends RouterOsTrapError {
  public constructor(category: string | undefined, message: string) {
    super(category, 'PERMANENT', message);
    this.name = 'UnknownTrap';
  }
}
