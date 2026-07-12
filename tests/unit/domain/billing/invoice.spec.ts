import { describe, expect, it } from 'vitest';
import { BillingAccountId } from '../../../../backend/domain/billing/accounts/value-objects/billing-account-id.js';
import { Invoice } from '../../../../backend/domain/billing/invoices/invoice.js';
import { InvoiceLine } from '../../../../backend/domain/billing/invoices/invoice-line.js';
import { InvoiceId } from '../../../../backend/domain/billing/invoices/value-objects/invoice-id.js';
import { InvoiceDescription } from '../../../../backend/domain/billing/invoices/value-objects/invoice-description.js';
import { InvoiceDueDate } from '../../../../backend/domain/billing/invoices/value-objects/invoice-due-date.js';
import { InvoiceLineId } from '../../../../backend/domain/billing/invoices/value-objects/invoice-line-id.js';
import { InvoiceNumber } from '../../../../backend/domain/billing/invoices/value-objects/invoice-number.js';
import { CurrencyCode } from '../../../../backend/domain/billing/shared/currency-code.js';
import { Money } from '../../../../backend/domain/billing/shared/money.js';
import { InvoiceStatusCalculator } from '../../../../backend/domain/billing/services/invoice-status-calculator.js';
function invoice(): Invoice {
  const currency = CurrencyCode.create('GTQ');
  return Invoice.issue({
    billingAccountId: BillingAccountId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30'),
    clientId: 'client-one',
    companyId: 'company-one',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    currency,
    dueOn: InvoiceDueDate.create(
      new Date('2026-07-10T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    ),
    id: InvoiceId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c31'),
    issuedOn: new Date('2026-07-01T00:00:00Z'),
    lines: [
      InvoiceLine.create({
        amount: Money.positive(10000, currency),
        description: InvoiceDescription.create('Servicio mensual'),
        id: InvoiceLineId.create('01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c32'),
        period: undefined,
        type: 'charge',
      }),
    ],
    number: InvoiceNumber.create('INV-00000001'),
  });
}
describe('Invoice aggregate', () => {
  it('calcula total desde líneas y delega el estado financiero al Domain Service', () => {
    const target = invoice();
    const calculator = new InvoiceStatusCalculator();
    expect(target.totalCents).toBe(10000);
    expect(calculator.calculate(target, 0, new Date('2026-07-11T00:00:00Z'))).toBe('overdue');
    expect(calculator.calculate(target, 5000, new Date('2026-07-05T00:00:00Z'))).toBe(
      'partially_paid',
    );
    expect(calculator.calculate(target, 10000, new Date('2026-07-11T00:00:00Z'))).toBe('paid');
    expect(target).not.toHaveProperty('financialStatus');
  });
});
