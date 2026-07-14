
export interface DashboardClientsReader {
  getTotalActiveClients(companyId: string): Promise<number>;
  getTotalActiveServices(companyId: string): Promise<number>;
}

export interface DashboardBillingReader {
  getMonthlyExpectedRevenueCents(companyId: string): Promise<number>;
  getCollectedThisMonthCents(companyId: string): Promise<number>;
  getOverdueThisMonthCents(companyId: string): Promise<number>;
  getUnpaidInvoicesCount(companyId: string): Promise<number>;
}

export interface DashboardNetworkReader {
  getDownNetworkNodesCount(companyId: string): Promise<number>;
  getTotalEquipments(companyId: string): Promise<number>;
  getEquipmentsByStatus(companyId: string, status: string): Promise<number>;
  getCriticalLinks(companyId: string, limit: number): Promise<Array<{ id: string; name: string; usagePercentage: number }>>;
}

export interface DashboardAlertingReader {
  getActiveCriticalAlertsCount(companyId: string): Promise<number>;
}

export interface DashboardActivityReader {
  getRecentActivities(companyId: string, limit: number): Promise<Array<{ id: string; type: string; message: string; timestamp: Date }>>;
}

export interface DashboardCachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}
