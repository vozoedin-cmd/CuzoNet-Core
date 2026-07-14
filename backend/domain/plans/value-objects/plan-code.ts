import { InvalidPlanDataError } from '../errors/invalid-plan-data.error.js';

const PLAN_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

export class PlanCode {
  private constructor(public readonly value: string) {}

  public static create(value: string): PlanCode {
    const normalizedValue = value.trim().toUpperCase();
    if (!PLAN_CODE_PATTERN.test(normalizedValue)) {
      throw new InvalidPlanDataError(
        'code',
        'Debe contener de 2 a 32 caracteres: letras, numeros, guion o guion bajo.',
      );
    }
    return new PlanCode(normalizedValue);
  }
}
