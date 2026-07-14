
import type { DashboardCachePort } from '../../application/ports/dashboard/readers.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryDashboardCache implements DashboardCachePort {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }
}
