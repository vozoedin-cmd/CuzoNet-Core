import type { BillingAccount } from '../../../domain/billing/accounts/billing-account.js';
export interface BillingAccountRepository {
  hasActive(companyId: string, serviceId: string, currencyCode: string): Promise<boolean>;
  save(account: BillingAccount): Promise<void>;
}
