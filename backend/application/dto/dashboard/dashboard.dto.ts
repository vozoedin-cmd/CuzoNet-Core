
export interface DashboardOverviewDto {
  totalActiveClients: number;
  totalActiveServices: number;
  monthlyExpectedRevenueCents: number;
  activeCriticalAlerts: number;
  downNetworkNodes: number;
}

export interface BillingSummaryDto {
  collectedThisMonthCents: number;
  overdueThisMonthCents: number;
  unpaidInvoicesCount: number;
  collectionRatePercentage: number;
}

export interface NetworkHealthDto {
  totalEquipments: number;
  equipmentsDown: number;
  equipmentsWarning: number;
  criticalLinks: Array<{ id: string; name: string; usagePercentage: number }>;
}

export interface ActivityFeedDto {
  activities: Array<{
    id: string;
    type: 'ALERT_TRIGGERED' | 'SERVICE_ACTIVATED' | 'PAYMENT_RECEIVED' | 'OTHER';
    message: string;
    timestamp: Date;
  }>;
}
