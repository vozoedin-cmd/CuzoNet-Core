import type { RequestHandler } from 'express';

import type { CompanyContext } from '../../application/ports/company-context.port.js';
import type { GetBillingSummaryQuery } from '../../application/queries/dashboard/get-billing-summary.query.js';
import type { GetDashboardOverviewQuery } from '../../application/queries/dashboard/get-dashboard-overview.query.js';
import type { GetNetworkHealthQuery } from '../../application/queries/dashboard/get-network-health.query.js';

export interface DashboardControllerDependencies {
  billingSummary: GetBillingSummaryQuery;
  companyContext: CompanyContext;
  networkHealth: GetNetworkHealthQuery;
  overview: GetDashboardOverviewQuery;
}

export class DashboardController {
  public constructor(private readonly dependencies: DashboardControllerDependencies) {}

  public readonly getOverview: RequestHandler = async (_request, response, next) => {
    try {
      const companyId = this.dependencies.companyContext.getCompanyId();
      response.status(200).json(await this.dependencies.overview.execute(companyId));
    } catch (error) {
      next(error);
    }
  };

  public readonly getBillingSummary: RequestHandler = async (_request, response, next) => {
    try {
      const companyId = this.dependencies.companyContext.getCompanyId();
      response.status(200).json(await this.dependencies.billingSummary.execute(companyId));
    } catch (error) {
      next(error);
    }
  };

  public readonly getNetworkHealth: RequestHandler = async (_request, response, next) => {
    try {
      const companyId = this.dependencies.companyContext.getCompanyId();
      response.status(200).json(await this.dependencies.networkHealth.execute(companyId));
    } catch (error) {
      next(error);
    }
  };
}
