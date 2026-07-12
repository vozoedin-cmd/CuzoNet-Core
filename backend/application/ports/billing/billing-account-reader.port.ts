import type { BillingAccount } from '../../../domain/billing/accounts/billing-account.js';
export interface BillingAccountReader {
  findById(companyId: string, accountId: string): Promise<BillingAccount | null>;
  listByClient(
    companyId: string,
    clientId: string,
    currencyCode?: string,
  ): Promise<readonly BillingAccount[]>;
}
