import type { BillingUnitOfWork } from '../../../../application/ports/billing/billing-unit-of-work.port.js';
export class InMemoryBillingUnitOfWork implements BillingUnitOfWork {
  public execute<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
