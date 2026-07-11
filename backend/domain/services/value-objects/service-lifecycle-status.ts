import { InvalidServiceDataError } from '../errors/invalid-service-data.error.js';

export const serviceLifecycleStatuses = [
  'pending',
  'active',
  'suspended',
  'cancelled',
  'archived',
] as const;

export type ServiceLifecycleStatusValue = (typeof serviceLifecycleStatuses)[number];

export class ServiceLifecycleStatus {
  private constructor(public readonly value: ServiceLifecycleStatusValue) {}

  public static pending(): ServiceLifecycleStatus {
    return new ServiceLifecycleStatus('pending');
  }

  public static create(value: string): ServiceLifecycleStatus {
    if (!serviceLifecycleStatuses.some((status) => status === value)) {
      throw new InvalidServiceDataError('lifecycleStatus', 'Estado de servicio no permitido.');
    }

    return new ServiceLifecycleStatus(value as ServiceLifecycleStatusValue);
  }
}
