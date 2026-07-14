
import { describe, it, expect, vi } from 'vitest';
import { GetDashboardOverviewQuery } from '../../../../backend/application/queries/dashboard/get-dashboard-overview.query.js';

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
    
    // Pass nulls to readers since they shouldn't be called
    const query = new GetDashboardOverviewQuery(null as unknown as any, null as unknown as any, null as unknown as any, null as unknown as any, cache);
    const result = await query.execute('c1');

    expect(result.totalActiveClients).toBe(50);
    expect(cache.get).toHaveBeenCalledWith('dashboard:overview:c1');
  });
});
