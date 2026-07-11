import { InvalidServiceDataError } from '../errors/invalid-service-data.error.js';

export const serviceTypes = ['simple_queue', 'pppoe', 'hotspot'] as const;
export type ServiceTypeValue = (typeof serviceTypes)[number];

export class ServiceType {
  private constructor(public readonly value: ServiceTypeValue) {}

  public static create(value: string): ServiceType {
    if (!serviceTypes.some((serviceType) => serviceType === value)) {
      throw new InvalidServiceDataError('serviceType', 'Debe ser simple_queue, pppoe o hotspot.');
    }

    return new ServiceType(value as ServiceTypeValue);
  }
}
