
import type { NetworkHealthDto } from '../../dto/dashboard/dashboard.dto.js';
import type { DashboardNetworkReader, DashboardCachePort } from '../../ports/dashboard/readers.js';

export class GetNetworkHealthQuery {
  constructor(
    private readonly networkReader: DashboardNetworkReader,
    private readonly cache: DashboardCachePort
  ) {}

  public async execute(companyId: string): Promise<NetworkHealthDto> {
    const cacheKey = `dashboard:network:${companyId}`;
    const cached = await this.cache.get<NetworkHealthDto>(cacheKey);
    if (cached) return cached;

    const [
      totalEquipments,
      equipmentsDown,
      equipmentsWarning,
      criticalLinks
    ] = await Promise.all([
      this.networkReader.getTotalEquipments(companyId),
      this.networkReader.getEquipmentsByStatus(companyId, 'DOWN'),
      this.networkReader.getEquipmentsByStatus(companyId, 'WARNING'),
      this.networkReader.getCriticalLinks(companyId, 5)
    ]);

    const result: NetworkHealthDto = {
      totalEquipments,
      equipmentsDown,
      equipmentsWarning,
      criticalLinks
    };

    await this.cache.set(cacheKey, result, 60); // 1 min TTL
    return result;
  }
}
