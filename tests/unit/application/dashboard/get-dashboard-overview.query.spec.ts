
import { describe, it, expect, vi } from 'vitest';
import { GetDashboardOverviewQuery } from '../../../../backend/application/queries/dashboard/get-dashboard-overview.query.js';
import type {
  DashboardAlertingReader,
  DashboardBillingReader,
  DashboardClientsReader,
  DashboardNetworkReader,
} from '../../../../backend/application/ports/dashboard/readers.js';

describe('GetDashboardOverviewQuery', () => {
  it('should fetch overview from readers if not in cache', async () => {
    const clientsReader = {
      getTotalActiveClients: vi.fn().mockResolvedValue(100),
      getTotalActiveServices: vi.fn().mockResolvedValue(150),
    };
    const billingReader = {
      getMonthlyExpectedRevenueCents: vi.fn().mockResolvedValue(100000),
      getCollectedThisMonthCents: vi.fn().mockResolvedValue(0),
      getOverdueThisMonthCents: vi.fn().mockResolvedValue(0),
      getUnpaidInvoicesCount: vi.fn().mockResolvedValue(0),
    };
    const alertingReader = {
      getActiveCriticalAlertsCount: vi.fn().mockResolvedValue(2),
    };
    const networkReader = {
      getDownNetworkNodesCount: vi.fn().mockResolvedValue(1),
      getTotalEquipments: vi.fn().mockResolvedValue(0),
      getEquipmentsByStatus: vi.fn().mockResolvedValue(0),
      getCriticalLinks: vi.fn().mockResolvedValue([]),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const query = new GetDashboardOverviewQuery(clientsReader, billingReader, alertingReader, networkReader, cache);
    const result = await query.execute('c1');

    expect(result.totalActiveClients).toBe(100);
    expect(result.monthlyExpectedRevenueCents).toBe(100000);
    expect(cache.get).toHaveBeenCalledWith('dashboard:overview:c1');
    expect(cache.set).toHaveBeenCalled();
  });

  it('should return from cache if available', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue({ totalActiveClients: 50 }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const clientsReader: DashboardClientsReader = {
      getTotalActiveClients: vi.fn<DashboardClientsReader['getTotalActiveClients']>(),
      getTotalActiveServices: vi.fn<DashboardClientsReader['getTotalActiveServices']>(),
    };
    const billingReader: DashboardBillingReader = {
      getMonthlyExpectedRevenueCents:
        vi.fn<DashboardBillingReader['getMonthlyExpectedRevenueCents']>(),
      getCollectedThisMonthCents:
        vi.fn<DashboardBillingReader['getCollectedThisMonthCents']>(),
      getOverdueThisMonthCents: vi.fn<DashboardBillingReader['getOverdueThisMonthCents']>(),
      getUnpaidInvoicesCount: vi.fn<DashboardBillingReader['getUnpaidInvoicesCount']>(),
    };
    const alertingReader: DashboardAlertingReader = {
      getActiveCriticalAlertsCount:
        vi.fn<DashboardAlertingReader['getActiveCriticalAlertsCount']>(),
    };
    const networkReader: DashboardNetworkReader = {
      getDownNetworkNodesCount: vi.fn<DashboardNetworkReader['getDownNetworkNodesCount']>(),
      getTotalEquipments: vi.fn<DashboardNetworkReader['getTotalEquipments']>(),
      getEquipmentsByStatus: vi.fn<DashboardNetworkReader['getEquipmentsByStatus']>(),
      getCriticalLinks: vi.fn<DashboardNetworkReader['getCriticalLinks']>(),
    };

    const query = new GetDashboardOverviewQuery(
      clientsReader,
      billingReader,
      alertingReader,
      networkReader,
      cache,
    );
    const result = await query.execute('c1');

    expect(result.totalActiveClients).toBe(50);
    expect(cache.get).toHaveBeenCalledWith('dashboard:overview:c1');
  });
});
