import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import { GetClientAccountSummary } from '../../../../backend/application/use-cases/billing/accounts/get-client-account-summary/get-client-account-summary.use-case.js';
import { IssueInvoice } from '../../../../backend/application/use-cases/billing/invoices/issue-invoice/issue-invoice.use-case.js';
import { RecordPayment } from '../../../../backend/application/use-cases/billing/payments/record-payment/record-payment.use-case.js';
import { GetAccountStatement } from '../../../../backend/application/use-cases/billing/statements/get-account-statement/get-account-statement.use-case.js';
import { BillingAccount } from '../../../../backend/domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../../backend/domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../../backend/domain/billing/accounts/value-objects/client-billing-reference-id.js';
import { ServiceBillingReferenceId } from '../../../../backend/domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { CurrencyCode } from '../../../../backend/domain/billing/shared/currency-code.js';
import { InMemoryDocumentNumberGenerator } from '../../../../backend/infrastructure/billing/invoice-numbers/in-memory-document-number-generator.js';
import { InMemoryCompanyBillingSettings } from '../../../../backend/infrastructure/billing/settings/in-memory-company-billing-settings.js';
import { InMemoryBillingAccountRepository } from '../../../../backend/infrastructure/database/billing/accounts/in-memory/in-memory-billing-account-repository.js';
import { InMemoryBillingUnitOfWork } from '../../../../backend/infrastructure/database/billing/in-memory/in-memory-billing-unit-of-work.js';
import { InMemoryStatementReader } from '../../../../backend/infrastructure/database/billing/in-memory/in-memory-statement-reader.js';
import { InMemoryInvoiceRepository } from '../../../../backend/infrastructure/database/billing/invoices/in-memory/in-memory-invoice-repository.js';
import { InMemoryPaymentRepository } from '../../../../backend/infrastructure/database/billing/payments/in-memory/in-memory-payment-repository.js';
import { InMemoryBillingOutbox } from '../../../../backend/infrastructure/events/in-memory-billing-outbox.js';
import { UuidV7IdGenerator } from '../../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };
const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10';

describe('Billing application flow', () => {
  it('emite una factura, registra una asignación y deriva deuda y crédito', async () => {
    const ids = new UuidV7IdGenerator();
    const accounts = new InMemoryBillingAccountRepository();
    const invoices = new InMemoryInvoiceRepository();
    const payments = new InMemoryPaymentRepository();
    const settings = new InMemoryCompanyBillingSettings();
    const outbox = new InMemoryBillingOutbox();
    const account = BillingAccount.open({
      clientId: ClientBillingReferenceId.create(clientId),
      companyId: 'company-one',
      currency: CurrencyCode.create('GTQ'),
      id: BillingAccountId.create(ids.generate()),
      openedAt: clock.now(),
      serviceId: ServiceBillingReferenceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20'),
    });
    await accounts.save(account);
    const issued = await new IssueInvoice(
      accounts,
      invoices,
      new InMemoryDocumentNumberGenerator(),
      companyContext,
      ids,
      clock,
    ).execute({
      accountId: account.id.value,
      dueOn: '2026-07-20',
      issuedOn: '2026-07-11',
      lines: [{ amountCents: 10000, description: 'Servicio mensual', type: 'charge' }],
    });
    const clientReader = {
      findById: () =>
        Promise.resolve({ clientId, companyId: 'company-one', status: 'active' as const }),
    };
    await new RecordPayment(
      payments,
      payments,
      payments,
      invoices,
      payments,
      clientReader,
      settings,
      outbox,
      new InMemoryBillingUnitOfWork(),
      companyContext,
      { getActorId: () => 'actor-one' },
      ids,
      clock,
    ).execute({
      allocations: [{ amountCents: 6000, invoiceId: issued.id }],
      amountCents: 8000,
      causationId: 'record-payment-0001',
      clientId,
      correlationId: 'correlation-one',
      currencyCode: 'GTQ',
      idempotencyKey: 'record-payment-0001',
      method: 'cash',
      receivedAt: '2026-07-11T14:00:00.000Z',
    });
    const summary = await new GetClientAccountSummary(
      clientReader,
      invoices,
      payments,
      payments,
      settings,
      companyContext,
      clock,
    ).execute(clientId);
    expect(summary).toMatchObject({ creditCents: 2000, debtCents: 4000, invoiceCount: 1 });
    expect(outbox.events()[0]?.payload.billingAccountId).toBe(account.id.value);
    const statement = await new GetAccountStatement(
      new InMemoryStatementReader(accounts, invoices, payments, payments),
      companyContext,
    ).execute({ accountId: account.id.value, from: '2026-07-01', to: '2026-07-31' });
    expect(statement).toMatchObject({
      closingCreditCents: 0,
      closingDebtCents: 4000,
      currencyCode: 'GTQ',
    });
    expect(statement.entries.map((entry) => [entry.type, entry.amountCents])).toEqual([
      ['invoice', 10000],
      ['payment', -6000],
    ]);
  });
});
