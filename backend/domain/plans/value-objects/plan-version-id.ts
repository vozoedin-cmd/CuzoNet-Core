import { InvalidPlanDataError } from '../errors/invalid-plan-data.error.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PlanVersionId {
  private constructor(public readonly value: string) {}

  public static create(value: string): PlanVersionId {
    const normalizedValue = value.toLowerCase();
    if (!UUID_V7_PATTERN.test(normalizedValue)) {
      throw new InvalidPlanDataError('planVersionId', 'Debe ser un UUIDv7 valido.');
    }
    return new PlanVersionId(normalizedValue);
  }
}
