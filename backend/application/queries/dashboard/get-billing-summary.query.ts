
import type { BillingSummaryDto } from '../../dto/dashboard/dashboard.dto.js';
import type { DashboardBillingReader, DashboardCachePort } from '../../ports/dashboard/readers.js';

export class GetBillingSummaryQuery {
  constructor(
    private readonly billingReader: DashboardBillingReader,
    private readonly cache: DashboardCachePort
  ) {}

  public async execute(companyId: string): Promise<BillingSummaryDto> {
    const cacheKey = `dashboard:billing:${companyId}`;
    const cached = await this.cache.get<BillingSummaryDto>(cacheKey);
    if (cached) return cached;

    const [
      collectedThisMonthCents,
      overdueThisMonthCents,
      unpaidInvoicesCount
    ] = await Promise.all([
      this.billingReader.getCollectedThisMonthCents(companyId),
      this.billingReader.getOverdueThisMonthCents(companyId),
      this.billingReader.getUnpaidInvoicesCount(companyId)
    ]);

    const total = collectedThisMonthCents + overdueThisMonthCents;
    const collectionRatePercentage = total > 0 ? Math.round((collectedThisMonthCents / total) * 100) : 100;

    const result: BillingSummaryDto = {
      collectedThisMonthCents,
      overdueThisMonthCents,
      unpaidInvoicesCount,
      collectionRatePercentage
    };

    await this.cache.set(cacheKey, result, 300);
    return result;
  }
}
