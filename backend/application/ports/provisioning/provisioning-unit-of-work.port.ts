export interface ProvisioningUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
