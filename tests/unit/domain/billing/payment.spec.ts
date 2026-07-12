import { describe, expect, it } from 'vitest';
import { Payment } from '../../../../backend/domain/billing/payments/payment.js';
import { PaymentAllocation } from '../../../../backend/domain/billing/payments/payment-allocation.js';
import { AllocatedMoney } from '../../../../backend/domain/billing/payments/value-objects/allocated-money.js';
import { PaymentAllocationId } from '../../../../backend/domain/billing/payments/value-objects/payment-allocation-id.js';
import { PaymentId } from '../../../../backend/domain/billing/payments/value-objects/payment-id.js';
import { InvoiceId } from '../../../../backend/domain/billing/invoices/value-objects/invoice-id.js';
import { CurrencyCode } from '../../../../backend/domain/billing/shared/currency-code.js';
import { Money } from '../../../../backend/domain/billing/shared/money.js';
describe('Payment aggregate', () => {
  it('protege asignaciones con AllocatedMoney y emite PaymentRecorded.v1 con billingAccountId', () => {
    const currency = CurrencyCode.create('GTQ');
    const allocation = PaymentAllocation.create({
      allocatedAt: new Date('2026-07-11T10:00:00Z'),
      amount: AllocatedMoney.create(5000, currency),
      billingAccountId: 'account-one',
      id: PaymentAllocationId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c41'),
      invoiceId: InvoiceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c31'),
    });
    const payment = Payment.record({
      allocations: [allocation],
      amount: Money.positive(10000, currency),
      billingAccountId: 'account-one',
      causationId: 'payment-request-0001',
      clientId: 'client-one',
      companyId: 'company-one',
      correlationId: 'correlation-one',
      eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c42',
      externalReference: undefined,
      id: PaymentId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40'),
      idempotencyKey: 'payment-request-0001',
      method: 'cash',
      receivedAt: new Date('2026-07-11T10:00:00Z'),
      receivedBy: 'actor-one',
      recordedAt: new Date('2026-07-11T10:00:00Z'),
    });
    expect(payment.allocatedCents).toBe(5000);
    expect(payment.pullDomainEvents()[0]).toMatchObject({
      eventType: 'PaymentRecorded.v1',
      payload: { billingAccountId: 'account-one' },
    });
  });
  it('rechaza AllocatedMoney no positivo', () => {
    expect(() => AllocatedMoney.create(0, CurrencyCode.create('GTQ'))).toThrow();
  });
});
