export class ProvisioningEngineError extends Error {
  public constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ProvisioningEngineError';
  }
}

export class InvalidProvisioningDataError extends ProvisioningEngineError {
  public constructor(field: string, reason: string) {
    super(`Campo inválido '${field}': ${reason}`, 'INVALID_PROVISIONING_DATA');
    this.name = 'InvalidProvisioningDataError';
  }
}

export class SensitiveDataInProvisioningError extends ProvisioningEngineError {
  public constructor(field: string) {
    super(`El campo '${field}' contiene datos sensibles y no puede ser persistido en ProvisioningRequest.`, 'SENSITIVE_DATA_DETECTED');
    this.name = 'SensitiveDataInProvisioningError';
  }
}

export class ProvisioningTransitionError extends ProvisioningEngineError {
  public constructor(fromStatus: string, toStatus: string) {
    super(`No se puede transicionar de '${fromStatus}' a '${toStatus}'.`, 'INVALID_STATUS_TRANSITION');
    this.name = 'ProvisioningTransitionError';
  }
}

export class ProvisioningIdempotencyConflictError extends ProvisioningEngineError {
  public constructor(idempotencyKey: string) {
    super(`Conflicto de idempotencia para la clave '${idempotencyKey}'. La huella de la solicitud no coincide con la original.`, 'IDEMPOTENCY_CONFLICT');
    this.name = 'ProvisioningIdempotencyConflictError';
  }
}
