
import type { GetDashboardOverviewQuery } from '../../application/queries/dashboard/get-dashboard-overview.query.js';
import type { GetBillingSummaryQuery } from '../../application/queries/dashboard/get-billing-summary.query.js';
import type { GetNetworkHealthQuery } from '../../application/queries/dashboard/get-network-health.query.js';

export interface HttpRequest {
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class DashboardController {
  constructor(
    private readonly overviewQuery: GetDashboardOverviewQuery,
    private readonly billingQuery: GetBillingSummaryQuery,
    private readonly networkQuery: GetNetworkHealthQuery
  ) {}

  public async getOverview(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const companyId = req.query.companyId;
      if (!companyId) throw new Error('companyId is required');
      
      const result = await this.overviewQuery.execute(companyId);
      res.status(200).json(result);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async getBillingSummary(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const companyId = req.query.companyId;
      if (!companyId) throw new Error('companyId is required');

      const result = await this.billingQuery.execute(companyId);
      res.status(200).json(result);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async getNetworkHealth(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const companyId = req.query.companyId;
      if (!companyId) throw new Error('companyId is required');

      const result = await this.networkQuery.execute(companyId);
      res.status(200).json(result);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
