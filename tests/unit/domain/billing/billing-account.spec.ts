import { describe, expect, it } from 'vitest';
import { BillingAccount } from '../../../../backend/domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../../backend/domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../../backend/domain/billing/accounts/value-objects/client-billing-reference-id.js';
import { ServiceBillingReferenceId } from '../../../../backend/domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { CurrencyCode } from '../../../../backend/domain/billing/shared/currency-code.js';
describe('BillingAccount aggregate', () => {
  it('abre y cierra una cuenta sin almacenar saldo', () => {
    const account = BillingAccount.open({
      clientId: ClientBillingReferenceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10'),
      companyId: 'company-one',
      currency: CurrencyCode.create('GTQ'),
      id: BillingAccountId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30'),
      openedAt: new Date('2026-07-01T00:00:00.000Z'),
      serviceId: ServiceBillingReferenceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20'),
    });
    expect(account.status).toBe('active');
    account.close(new Date('2026-07-11T00:00:00.000Z'));
    expect(account.status).toBe('closed');
    expect(account).not.toHaveProperty('balance');
  });
});
