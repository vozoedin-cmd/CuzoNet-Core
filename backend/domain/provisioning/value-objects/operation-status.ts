import { InvalidProvisioningDataError } from '../errors/invalid-provisioning-data.error.js';

export const operationStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'manual_review',
] as const;
export type OperationStatusValue = (typeof operationStatuses)[number];

export class OperationStatus {
  private constructor(public readonly value: OperationStatusValue) {}

  public static queued(): OperationStatus {
    return new OperationStatus('queued');
  }

  public static create(value: string): OperationStatus {
    if (!operationStatuses.some((status) => status === value)) {
      throw new InvalidProvisioningDataError('status', 'Estado de operación no permitido.');
    }
    return new OperationStatus(value as OperationStatusValue);
  }
}
