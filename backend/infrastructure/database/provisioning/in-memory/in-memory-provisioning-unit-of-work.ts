import type { ProvisioningUnitOfWork } from '../../../../application/ports/provisioning/provisioning-unit-of-work.port.js';

export class InMemoryProvisioningUnitOfWork implements ProvisioningUnitOfWork {
  public execute<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
