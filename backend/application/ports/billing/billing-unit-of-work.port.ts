export interface BillingUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
