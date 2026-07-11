import { InvalidServiceDataError } from '../errors/invalid-service-data.error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PlanVersionId {
  private constructor(public readonly value: string) {}

  public static create(value: string): PlanVersionId {
    const normalizedValue = value.toLowerCase();

    if (!UUID_PATTERN.test(normalizedValue)) {
      throw new InvalidServiceDataError('planVersionId', 'Debe ser un UUID válido.');
    }

    return new PlanVersionId(normalizedValue);
  }
}
