import { BillingAccount } from '../../../../../domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../../../domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/client-billing-reference-id.js';
import {
  createBillingAccountStatus,
  type BillingAccountStatus,
} from '../../../../../domain/billing/accounts/value-objects/billing-account-status.js';
import { ServiceBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
export interface BillingAccountRecord {
  clientId: string;
  closedAt: string | undefined;
  companyId: string;
  currencyCode: string;
  id: string;
  openedAt: string;
  serviceId: string;
  status: BillingAccountStatus;
}
export const inMemoryBillingAccountMapper = {
  toRecord(account: BillingAccount): BillingAccountRecord {
    return {
      clientId: account.clientId,
      closedAt: account.closedAt?.toISOString(),
      companyId: account.companyId,
      currencyCode: account.currency.value,
      id: account.id.value,
      openedAt: account.openedAt.toISOString(),
      serviceId: account.serviceId.value,
      status: account.status,
    };
  },
  toDomain(record: BillingAccountRecord): BillingAccount {
    return BillingAccount.rehydrate({
      clientId: ClientBillingReferenceId.create(record.clientId),
      closedAt: record.closedAt === undefined ? undefined : new Date(record.closedAt),
      companyId: record.companyId,
      currency: CurrencyCode.create(record.currencyCode),
      id: BillingAccountId.create(record.id),
      openedAt: new Date(record.openedAt),
      serviceId: ServiceBillingReferenceId.create(record.serviceId),
      status: createBillingAccountStatus(record.status),
    });
  },
};
