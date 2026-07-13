import type {
  BillingAutomationContext,
  BillingAutomationReader,
} from '../../../application/ports/automation/billing-automation-reader.port.js';
import type { BillingAccountReader } from '../../../application/ports/billing/billing-account-reader.port.js';
import type { InvoiceReader } from '../../../application/ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../application/ports/billing/payment-allocation-reader.port.js';
import type { Clock } from '../../../application/ports/clock.port.js';
export class BillingAutomationReaderAdapter implements BillingAutomationReader {
  public constructor(
    private readonly accounts: BillingAccountReader,
    private readonly invoices: InvoiceReader,
    private readonly allocations: PaymentAllocationReader,
    private readonly clock: Clock,
  ) {}
  public async contextsForPayment(
    companyId: string,
    clientId: string,
    billingAccountId: string | null,
  ): Promise<readonly BillingAutomationContext[]> {
    const accounts = (await this.accounts.listByClient(companyId, clientId)).filter(
      (account) => billingAccountId === null || account.id.value === billingAccountId,
    );
    return Promise.all(
      accounts.map(async (account) => {
        const invoices = (
          await this.invoices.list({ accountId: account.id.value, companyId })
        ).filter((invoice) => invoice.documentStatus === 'issued');
        let debtCents = 0;
        let overdueCents = 0;
        for (const invoice of invoices) {
          const allocated = await this.allocations.allocatedToInvoice(companyId, invoice.id.value);
          const outstanding = Math.max(0, invoice.totalCents - allocated);
          debtCents += outstanding;
          if (outstanding > 0 && invoice.dueOn < this.clock.now()) overdueCents += outstanding;
        }
        return {
          billingAccountId: account.id.value,
          creditCents: 0,
          currencyCode: account.currency.value,
          debtCents,
          overdueCents,
          serviceId: account.serviceId.value,
        };
      }),
    );
  }
}
