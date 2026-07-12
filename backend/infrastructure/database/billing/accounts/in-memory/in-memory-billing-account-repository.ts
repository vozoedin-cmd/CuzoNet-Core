import type { BillingAccountReader } from '../../../../../application/ports/billing/billing-account-reader.port.js';
import type { BillingAccountRepository } from '../../../../../application/ports/billing/billing-account-repository.port.js';
import type { BillingAccount } from '../../../../../domain/billing/accounts/billing-account.js';
import {
  inMemoryBillingAccountMapper,
  type BillingAccountRecord,
} from './in-memory-billing-account.mapper.js';
export class InMemoryBillingAccountRepository
  implements BillingAccountRepository, BillingAccountReader
{
  private readonly records = new Map<string, BillingAccountRecord>();
  public save(account: BillingAccount): Promise<void> {
    this.records.set(
      `${account.companyId}:${account.id.value}`,
      inMemoryBillingAccountMapper.toRecord(account),
    );
    return Promise.resolve();
  }
  public hasActive(companyId: string, serviceId: string, currencyCode: string): Promise<boolean> {
    return Promise.resolve(
      [...this.records.values()].some(
        (record) =>
          record.companyId === companyId &&
          record.serviceId === serviceId &&
          record.currencyCode === currencyCode &&
          record.status === 'active',
      ),
    );
  }
  public findById(companyId: string, accountId: string): Promise<BillingAccount | null> {
    const record = this.records.get(`${companyId}:${accountId}`);
    return Promise.resolve(
      record === undefined ? null : inMemoryBillingAccountMapper.toDomain(record),
    );
  }
  public listByClient(
    companyId: string,
    clientId: string,
    currencyCode?: string,
  ): Promise<readonly BillingAccount[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter(
          (record) =>
            record.companyId === companyId &&
            record.clientId === clientId &&
            (currencyCode === undefined || record.currencyCode === currencyCode),
        )
        .map(inMemoryBillingAccountMapper.toDomain),
    );
  }
}
