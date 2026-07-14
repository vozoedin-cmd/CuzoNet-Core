
import type { DashboardOverviewDto } from '../../dto/dashboard/dashboard.dto.js';
import type { DashboardClientsReader, DashboardBillingReader, DashboardAlertingReader, DashboardNetworkReader, DashboardCachePort } from '../../ports/dashboard/readers.js';

export class GetDashboardOverviewQuery {
  constructor(
    private readonly clientsReader: DashboardClientsReader,
    private readonly billingReader: DashboardBillingReader,
    private readonly alertingReader: DashboardAlertingReader,
    private readonly networkReader: DashboardNetworkReader,
    private readonly cache: DashboardCachePort
  ) {}

  public async execute(companyId: string): Promise<DashboardOverviewDto> {
    const cacheKey = `dashboard:overview:${companyId}`;
    const cached = await this.cache.get<DashboardOverviewDto>(cacheKey);
    if (cached) return cached;

    const [
      totalActiveClients,
      totalActiveServices,
      monthlyExpectedRevenueCents,
      activeCriticalAlerts,
      downNetworkNodes
    ] = await Promise.all([
      this.clientsReader.getTotalActiveClients(companyId),
      this.clientsReader.getTotalActiveServices(companyId),
      this.billingReader.getMonthlyExpectedRevenueCents(companyId),
      this.alertingReader.getActiveCriticalAlertsCount(companyId),
      this.networkReader.getDownNetworkNodesCount(companyId)
    ]);

    const result: DashboardOverviewDto = {
      totalActiveClients,
      totalActiveServices,
      monthlyExpectedRevenueCents,
      activeCriticalAlerts,
      downNetworkNodes
    };

    await this.cache.set(cacheKey, result, 300); // 5 min TTL
    return result;
  }
}
