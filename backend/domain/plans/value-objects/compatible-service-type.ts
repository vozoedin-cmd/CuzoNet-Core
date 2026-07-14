import { InvalidPlanDataError } from '../errors/invalid-plan-data.error.js';

export const compatibleServiceTypes = ['simple_queue', 'pppoe', 'hotspot'] as const;
export type CompatibleServiceTypeValue = (typeof compatibleServiceTypes)[number];

export class CompatibleServiceType {
  private constructor(public readonly value: CompatibleServiceTypeValue) {}

  public static create(value: string): CompatibleServiceType {
    if (!compatibleServiceTypes.some((candidate) => candidate === value)) {
      throw new InvalidPlanDataError(
        'serviceType',
        'Debe ser simple_queue, pppoe o hotspot.',
      );
    }
    return new CompatibleServiceType(value as CompatibleServiceTypeValue);
  }
}
