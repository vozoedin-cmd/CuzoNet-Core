
import { describe, it, expect, vi } from 'vitest';
import { GetBillingSummaryQuery } from '../../../../backend/application/queries/dashboard/get-billing-summary.query.js';

describe('GetBillingSummaryQuery', () => {
  it('should calculate collection rate percentage correctly', async () => {
    const billingReader = {
      getCollectedThisMonthCents: vi.fn().mockResolvedValue(5000),
      getOverdueThisMonthCents: vi.fn().mockResolvedValue(5000),
      getUnpaidInvoicesCount: vi.fn().mockResolvedValue(5),
      getMonthlyExpectedRevenueCents: vi.fn().mockResolvedValue(0),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const query = new GetBillingSummaryQuery(billingReader, cache);
    const result = await query.execute('c1');

    expect(result.collectedThisMonthCents).toBe(5000);
    expect(result.collectionRatePercentage).toBe(50);
  });
});
