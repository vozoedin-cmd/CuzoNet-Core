import { BillingAccount } from '../../../../../domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../../../domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/client-billing-reference-id.js';
import { createBillingAccountStatus } from '../../../../../domain/billing/accounts/value-objects/billing-account-status.js';
import { ServiceBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import type { BillingAccountTable } from '../../../sqlite/database-schema.js';

export const sqliteBillingAccountMapper = {
  toDomain(record: BillingAccountTable): BillingAccount {
    return BillingAccount.rehydrate({
      clientId: ClientBillingReferenceId.create(record.client_id),
      closedAt: record.closed_at === null ? undefined : new Date(record.closed_at),
      companyId: record.company_id,
      currency: CurrencyCode.create(record.currency_code),
      id: BillingAccountId.create(record.id),
      openedAt: new Date(record.opened_at),
      serviceId: ServiceBillingReferenceId.create(record.service_id),
      status: createBillingAccountStatus(record.status),
    });
  },
};
