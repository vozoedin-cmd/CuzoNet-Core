import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AutomationRule } from '../../../backend/domain/automation/automation-rule.js';
import { ActionDefinition } from '../../../backend/domain/automation/value-objects/action-definition.js';
import { AutomationRuleId } from '../../../backend/domain/automation/value-objects/automation-rule-id.js';
import { AutomationRuleName } from '../../../backend/domain/automation/value-objects/automation-rule-name.js';
import { AutomationRuleStatus } from '../../../backend/domain/automation/value-objects/automation-rule-status.js';
import { AutomationRuleVersion } from '../../../backend/domain/automation/value-objects/automation-rule-version.js';
import { EventTrigger } from '../../../backend/domain/automation/value-objects/event-trigger.js';
import { RuleCondition } from '../../../backend/domain/automation/value-objects/rule-condition.js';
import { BillingAccount } from '../../../backend/domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../backend/domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../backend/domain/billing/accounts/value-objects/client-billing-reference-id.js';
import { ServiceBillingReferenceId } from '../../../backend/domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { Invoice } from '../../../backend/domain/billing/invoices/invoice.js';
import { InvoiceLine } from '../../../backend/domain/billing/invoices/invoice-line.js';
import { InvoiceDescription } from '../../../backend/domain/billing/invoices/value-objects/invoice-description.js';
import { InvoiceDueDate } from '../../../backend/domain/billing/invoices/value-objects/invoice-due-date.js';
import { InvoiceId } from '../../../backend/domain/billing/invoices/value-objects/invoice-id.js';
import { InvoiceLineId } from '../../../backend/domain/billing/invoices/value-objects/invoice-line-id.js';
import { InvoiceNumber } from '../../../backend/domain/billing/invoices/value-objects/invoice-number.js';
import { Payment } from '../../../backend/domain/billing/payments/payment.js';
import { PaymentAllocation } from '../../../backend/domain/billing/payments/payment-allocation.js';
import { AllocatedMoney } from '../../../backend/domain/billing/payments/value-objects/allocated-money.js';
import { PaymentAllocationId } from '../../../backend/domain/billing/payments/value-objects/payment-allocation-id.js';
import { PaymentId } from '../../../backend/domain/billing/payments/value-objects/payment-id.js';
import { CurrencyCode } from '../../../backend/domain/billing/shared/currency-code.js';
import { Money } from '../../../backend/domain/billing/shared/money.js';
import { SqliteDocumentNumberGenerator } from '../../../backend/infrastructure/billing/invoice-numbers/sqlite-document-number-generator.js';
import { SqliteCompanyBillingSettings } from '../../../backend/infrastructure/billing/settings/sqlite-company-billing-settings.js';
import { SqliteAutomationEventReceipt } from '../../../backend/infrastructure/database/automation/sqlite/sqlite-automation-event-receipt.js';
import { SqliteAutomationExecutionRepository } from '../../../backend/infrastructure/database/automation/sqlite/sqlite-automation-execution-repository.js';
import { SqliteAutomationRuleRepository } from '../../../backend/infrastructure/database/automation/sqlite/sqlite-automation-rule-repository.js';
import { SqliteBillingAccountRepository } from '../../../backend/infrastructure/database/billing/accounts/sqlite/sqlite-billing-account-repository.js';
import { SqliteInvoiceRepository } from '../../../backend/infrastructure/database/billing/invoices/sqlite/sqlite-invoice-repository.js';
import { SqlitePaymentRepository } from '../../../backend/infrastructure/database/billing/payments/sqlite/sqlite-payment-repository.js';
import { SqliteStatementReader } from '../../../backend/infrastructure/database/billing/sqlite/sqlite-statement-reader.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteOutboxRepository } from '../../../backend/infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const now = new Date('2026-07-12T12:00:00.000Z');
const clock = { now: () => now };
const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10';
const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const accountId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30';
const invoiceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c31';

describe('SQLite Billing and Automation adapters', () => {
  let directory: string;
  let database: SqliteDatabase;
  let companyId: string;
  let idGenerator: UuidV7IdGenerator;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-sqlite-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
    new MigrationRunner(database.connection, clock).migrate();
    idGenerator = new UuidV7IdGenerator();
    companyId = await new CompanyBootstrap(database.session, idGenerator).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      now,
    );
    database.connection
      .prepare(
        `INSERT INTO clients
          (id, company_id, client_type, document_type, document_number, document_key,
           legal_name, status, created_at, updated_at, archived_at)
           VALUES (?, ?, 'person', 'dpi', '1234567890101', 'dpi:1234567890101',
           'Ana López', 'active', ?, NULL, NULL)`,
      )
      .run(clientId, companyId, now.toISOString());
    database.connection
      .prepare(
        `INSERT INTO client_services
          (id, company_id, client_id, plan_version_id, service_type, lifecycle_status,
           billing_day, created_at, started_on, ended_on)
         VALUES (?, ?, ?, ?, 'simple_queue', 'active', 15, ?, ?, NULL)`,
      )
      .run(
        serviceId,
        companyId,
        clientId,
        '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22',
        now.toISOString(),
        now.toISOString(),
      );
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('rehidrata Accounts, Invoices y Payments y construye Statement como lectura', async () => {
    const currency = CurrencyCode.create('GTQ');
    const accounts = new SqliteBillingAccountRepository(database.session);
    const invoices = new SqliteInvoiceRepository(database.session);
    const payments = new SqlitePaymentRepository(database.session);
    const account = BillingAccount.open({
      clientId: ClientBillingReferenceId.create(clientId),
      companyId,
      currency,
      id: BillingAccountId.create(accountId),
      openedAt: now,
      serviceId: ServiceBillingReferenceId.create(serviceId),
    });
    const invoice = Invoice.issue({
      billingAccountId: BillingAccountId.create(accountId),
      clientId,
      companyId,
      createdAt: now,
      currency,
      dueOn: InvoiceDueDate.create(new Date('2026-07-20T00:00:00.000Z'), now),
      id: InvoiceId.create(invoiceId),
      issuedOn: now,
      lines: [
        InvoiceLine.create({
          amount: Money.positive(10_000, currency),
          description: InvoiceDescription.create('Servicio mensual'),
          id: InvoiceLineId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c32'),
          period: undefined,
          type: 'charge',
        }),
      ],
      number: InvoiceNumber.create('INV-00000001'),
    });
    const payment = Payment.record({
      allocations: [
        PaymentAllocation.create({
          allocatedAt: now,
          amount: AllocatedMoney.create(4_000, currency),
          billingAccountId: accountId,
          id: PaymentAllocationId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c41'),
          invoiceId: InvoiceId.create(invoiceId),
        }),
      ],
      amount: Money.positive(4_000, currency),
      billingAccountId: accountId,
      causationId: 'payment-1',
      clientId,
      companyId,
      correlationId: 'correlation-payment-1',
      eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c42',
      externalReference: undefined,
      id: PaymentId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40'),
      idempotencyKey: 'payment-1',
      method: 'cash',
      receivedAt: now,
      receivedBy: 'actor-one',
      recordedAt: now,
    });

    await accounts.save(account);
    await invoices.save(invoice);
    await payments.save(payment);

    expect(await accounts.findById(companyId, accountId)).toMatchObject({ status: 'active' });
    expect((await invoices.findById(companyId, invoiceId))?.totalCents).toBe(10_000);
    expect((await payments.findById(companyId, payment.id.value))?.allocatedCents).toBe(4_000);
    await expect(
      new SqliteStatementReader(database.session).getAccountStatement(
        companyId,
        accountId,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T23:59:59.999Z'),
      ),
    ).resolves.toMatchObject({ closingDebtCents: 6_000, entries: [{ type: 'invoice' }, { type: 'payment' }] });
  });

  it('genera números documentales atómicos y lee settings desde Company', async () => {
    const numbers = new SqliteDocumentNumberGenerator(database.session, clock);

    await expect(numbers.nextInvoiceNumber(companyId)).resolves.toBe('INV-00000001');
    await expect(numbers.nextInvoiceNumber(companyId)).resolves.toBe('INV-00000002');
    await expect(new SqliteCompanyBillingSettings(database.session).get(companyId)).resolves.toEqual({
      currencyCode: 'GTQ',
      timezone: 'America/Guatemala',
    });
  });

  it('persiste reglas, ejecuciones y recibos de Automation sobre el outbox compartido', async () => {
    const ruleId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d01';
    const eventId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d02';
    const executionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2d03';
    const rules = new SqliteAutomationRuleRepository(database.session);
    const executions = new SqliteAutomationExecutionRepository(database.session);
    const receipts = new SqliteAutomationEventReceipt(database.session, idGenerator, clock);
    const rule = AutomationRule.create({
      actions: [
        ActionDefinition.create({
          actionType: 'request_service_reactivation',
          actionVersion: 1,
          reasonCode: 'PAYMENT_CLEARED',
          targetFactPath: 'service.id',
        }),
      ],
      companyId,
      condition: RuleCondition.create({
        kind: 'comparison',
        operator: 'equals',
        path: 'billing.debtCents',
        value: 0,
      }),
      createdAt: now,
      createdBy: 'actor-one',
      id: AutomationRuleId.create(ruleId),
      name: AutomationRuleName.create('Reactivar al liquidar deuda'),
      priority: 750,
      status: AutomationRuleStatus.active(),
      trigger: EventTrigger.create('PaymentRecorded.v1', 1),
      version: AutomationRuleVersion.create(1),
    });
    await new SqliteOutboxRepository(database.session).append([
      {
        aggregateId: 'payment-one',
        aggregateType: 'Payment',
        causationId: 'payment-1',
        correlationId: 'correlation-payment-1',
        eventId,
        eventType: 'PaymentRecorded.v1',
        occurredAt: now.toISOString(),
        payload: { companyId },
        schemaVersion: 1,
      },
    ]);
    await rules.save(rule);
    await executions.save(companyId, {
      actionResults: [],
      completedAt: now.toISOString(),
      contextId: serviceId,
      eventId,
      id: executionId,
      matched: false,
      ruleId,
      ruleVersion: 1,
      startedAt: now.toISOString(),
      status: 'evaluated_no_match',
    });
    await receipts.mark(companyId, eventId, 'processing');
    await receipts.mark(companyId, eventId, 'processed');

    expect(await rules.findById(companyId, ruleId)).toMatchObject({ priority: 750 });
    expect(await executions.findById(companyId, executionId)).toMatchObject({
      matched: false,
      status: 'evaluated_no_match',
    });
    await expect(receipts.getStatus(companyId, eventId)).resolves.toBe('processed');
  });
});
