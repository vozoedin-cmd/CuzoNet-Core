import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillingController } from '../../../backend/api/billing/controller/billing.controller.js';
import { createBillingRouter } from '../../../backend/api/billing/routes/billing.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { GetClientAccountSummary } from '../../../backend/application/use-cases/billing/accounts/get-client-account-summary/get-client-account-summary.use-case.js';
import { ListPayments } from '../../../backend/application/use-cases/billing/payments/list-payments/list-payments.use-case.js';
import { RecordPayment } from '../../../backend/application/use-cases/billing/payments/record-payment/record-payment.use-case.js';
import { CreateClient } from '../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { ClientBillingReaderAdapter } from '../../../backend/infrastructure/billing/clients/client-billing-reader.adapter.js';
import { InMemoryCompanyBillingSettings } from '../../../backend/infrastructure/billing/settings/in-memory-company-billing-settings.js';
import { InMemoryBillingUnitOfWork } from '../../../backend/infrastructure/database/billing/in-memory/in-memory-billing-unit-of-work.js';
import { InMemoryInvoiceRepository } from '../../../backend/infrastructure/database/billing/invoices/in-memory/in-memory-invoice-repository.js';
import { InMemoryPaymentRepository } from '../../../backend/infrastructure/database/billing/payments/in-memory/in-memory-payment-repository.js';
import { InMemoryClientRepository } from '../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { InMemoryBillingOutbox } from '../../../backend/infrastructure/events/in-memory-billing-outbox.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const correlationId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50';
describe('Billing API integration', () => {
  let app: ReturnType<typeof createApp>;
  let clientId: string;
  let outbox: InMemoryBillingOutbox;
  beforeEach(async () => {
    const clients = new InMemoryClientRepository();
    const payments = new InMemoryPaymentRepository();
    const invoices = new InMemoryInvoiceRepository();
    const settings = new InMemoryCompanyBillingSettings();
    const ids = new UuidV7IdGenerator();
    const client = await new CreateClient(clients, companyContext, ids, clock).execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'client-correlation',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
    });
    clientId = client.client.id;
    outbox = new InMemoryBillingOutbox();
    const clientReader = new ClientBillingReaderAdapter(clients);
    const controller = new BillingController({
      getClientAccountSummary: new GetClientAccountSummary(
        clientReader,
        invoices,
        payments,
        payments,
        settings,
        companyContext,
        clock,
      ),
      listPayments: new ListPayments(payments, companyContext),
      recordPayment: new RecordPayment(
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
      ),
    });
    app = createApp({ billingRouter: createBillingRouter(controller) });
  });
  function postPayment() {
    return request(app)
      .post('/pagos')
      .set('Idempotency-Key', 'record-payment-0001')
      .set('X-Correlation-Id', correlationId)
      .send({
        amountCents: 10000,
        clientId,
        currencyCode: 'GTQ',
        method: 'cash',
        receivedAt: '2026-07-11T14:30:00.000Z',
      });
  }
  it('registra, lista y refleja crédito derivado en el resumen', async () => {
    const created = await postPayment().expect(201);
    expect(created.body).toEqual({
      allocations: [],
      amountCents: 10000,
      clientId,
      currencyCode: 'GTQ',
      id: created.body.id,
      method: 'cash',
      receivedAt: '2026-07-11T14:30:00.000Z',
      status: 'recorded',
    });
    const page = await request(app).get('/pagos').expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(page.body.data).toEqual([created.body]);
    const summary = await request(app).get(`/clientes/${clientId}/cuenta`).expect(200);
    expect(summary.body).toEqual({
      clientId,
      creditCents: 10000,
      currencyCode: 'GTQ',
      debtCents: 0,
      invoiceCount: 0,
      nextDueOn: null,
      overdueCents: 0,
    });
  });
  it('es idempotente y guarda una sola vez PaymentRecorded.v1 con billingAccountId', async () => {
    const first = await postPayment().expect(201);
    const second = await postPayment().expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(outbox.events()).toHaveLength(1);
    expect(outbox.events()[0]).toMatchObject({
      eventType: 'PaymentRecorded.v1',
      payload: { billingAccountId: null },
    });
  });
  it('usa errores globales y no monta rutas no publicadas', async () => {
    await request(app)
      .post('/pagos')
      .set('Idempotency-Key', 'record-payment-0001')
      .send({
        amountCents: 10000,
        clientId,
        currencyCode: 'USD',
        method: 'cash',
        receivedAt: '2026-07-11T14:30:00.000Z',
      })
      .expect(409);
    await request(app).get('/facturas').expect(404);
    await request(app).get('/estados-de-cuenta').expect(404);
  });
});
