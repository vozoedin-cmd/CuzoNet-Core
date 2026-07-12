import { InvalidProvisioningDataError } from '../errors/invalid-provisioning-data.error.js';

const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export class OperationFailure {
  private constructor(
    public readonly code: string,
    public readonly message: string,
  ) {}

  public static create(code: string, message: string): OperationFailure {
    if (!SAFE_CODE.test(code)) {
      throw new InvalidProvisioningDataError('lastErrorCode', 'Código de error no permitido.');
    }
    const sanitizedMessage = message.trim();
    if (sanitizedMessage.length === 0 || sanitizedMessage.length > 500) {
      throw new InvalidProvisioningDataError('lastErrorMessage', 'Mensaje de error no permitido.');
    }
    return new OperationFailure(code, sanitizedMessage);
  }
}
