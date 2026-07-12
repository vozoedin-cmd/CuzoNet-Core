import { InvalidProvisioningDataError } from '../errors/invalid-provisioning-data.error.js';

export const operationTypes = ['provision'] as const;
export type OperationTypeValue = (typeof operationTypes)[number];

export class OperationType {
  private constructor(public readonly value: OperationTypeValue) {}

  public static provision(): OperationType {
    return new OperationType('provision');
  }

  public static create(value: string): OperationType {
    if (value !== 'provision') {
      throw new InvalidProvisioningDataError('type', 'Tipo de operación no permitido.');
    }
    return new OperationType(value);
  }
}
