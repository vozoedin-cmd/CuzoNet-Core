export interface ServiceLifecyclePort {
  activate(companyId: string, serviceId: string, startedAt: Date): Promise<void>;
}
