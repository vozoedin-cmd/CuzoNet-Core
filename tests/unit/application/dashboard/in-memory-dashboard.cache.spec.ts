
import { describe, it, expect } from 'vitest';
import { InMemoryDashboardCache } from '../../../../backend/infrastructure/dashboard/in-memory-dashboard.cache.js';

describe('InMemoryDashboardCache', () => {
  it('should set and get values', async () => {
    const cache = new InMemoryDashboardCache();
    await cache.set('key1', { a: 1 }, 10);
    
    const val = await cache.get<{ a: number }>('key1');
    expect(val?.a).toBe(1);
  });

  it('should return null for expired keys', async () => {
    const cache = new InMemoryDashboardCache();
    await cache.set('key2', { b: 2 }, -1); // already expired
    
    const val = await cache.get('key2');
    expect(val).toBeNull();
  });
});
