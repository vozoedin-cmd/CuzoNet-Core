import { InvalidPlanDataError } from '../errors/invalid-plan-data.error.js';

export class PlanName {
  private constructor(public readonly value: string) {}

  public static create(value: string): PlanName {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 2 || normalizedValue.length > 120) {
      throw new InvalidPlanDataError('name', 'Debe contener entre 2 y 120 caracteres.');
    }
    return new PlanName(normalizedValue);
  }
}
