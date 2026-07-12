import type {
  AccountStatementDto,
  StatementEntryDto,
} from '../../../../application/dto/billing/statement.dto.js';
import type { BillingAccountReader } from '../../../../application/ports/billing/billing-account-reader.port.js';
import type { InvoiceReader } from '../../../../application/ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../application/ports/billing/payment-allocation-reader.port.js';
import type { PaymentReader } from '../../../../application/ports/billing/payment-reader.port.js';
import type { StatementReader } from '../../../../application/ports/billing/statement-reader.port.js';
export class InMemoryStatementReader implements StatementReader {
  public constructor(
    private readonly accounts: BillingAccountReader,
    private readonly invoices: InvoiceReader,
    private readonly payments: PaymentReader,
    private readonly allocations: PaymentAllocationReader,
  ) {}
  public async getAccountStatement(
    companyId: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AccountStatementDto | null> {
    const account = await this.accounts.findById(companyId, accountId);
    if (account === null) return null;
    const invoices = await this.invoices.list({ accountId, companyId });
    const payments = (await this.payments.listAllByClient(companyId, account.clientId)).filter(
      (payment) =>
        payment.allocations.some((allocation) => allocation.billingAccountId === accountId),
    );
    const entries: StatementEntryDto[] = [];
    let debt = 0;
    for (const invoice of invoices) {
      if (invoice.documentStatus === 'cancelled') continue;
      const allocated = await this.allocations.allocatedToInvoice(companyId, invoice.id.value);
      debt += Math.max(0, invoice.totalCents - allocated);
      if (invoice.issuedOn >= from && invoice.issuedOn <= to)
        entries.push({
          amountCents: invoice.totalCents,
          occurredAt: invoice.issuedOn.toISOString(),
          referenceId: invoice.id.value,
          type: 'invoice',
        });
    }
    for (const payment of payments) {
      const accountAllocated = payment.allocations
        .filter((allocation) => allocation.billingAccountId === accountId)
        .reduce((sum, allocation) => sum + allocation.amount.cents, 0);
      if (payment.receivedAt >= from && payment.receivedAt <= to)
        entries.push({
          amountCents: payment.status === 'recorded' ? -accountAllocated : accountAllocated,
          occurredAt: payment.receivedAt.toISOString(),
          referenceId: payment.id.value,
          type: payment.status === 'recorded' ? 'payment' : 'reversal',
        });
    }
    entries.sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.referenceId.localeCompare(b.referenceId),
    );
    return {
      accountId,
      closingCreditCents: 0,
      closingDebtCents: debt,
      currencyCode: account.currency.value,
      entries,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}
