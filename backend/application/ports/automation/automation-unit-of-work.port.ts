export interface AutomationUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
