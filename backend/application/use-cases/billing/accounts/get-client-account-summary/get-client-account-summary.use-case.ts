import type { AccountSummaryDto } from '../../../../dto/billing/billing-account.dto.js';
import type { ClientBillingReader } from '../../../../ports/billing/client-billing-reader.port.js';
import type { CompanyBillingSettingsPort } from '../../../../ports/billing/company-billing-settings.port.js';
import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { PaymentReader } from '../../../../ports/billing/payment-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { ClientNotFoundError } from '../../../../../domain/clients/errors/client-not-found.error.js';
export class GetClientAccountSummary {
  public constructor(
    private readonly clientReader: ClientBillingReader,
    private readonly invoiceReader: InvoiceReader,
    private readonly paymentReader: PaymentReader,
    private readonly allocationReader: PaymentAllocationReader,
    private readonly settings: CompanyBillingSettingsPort,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(clientId: string): Promise<AccountSummaryDto> {
    const companyId = this.companyContext.getCompanyId();
    if ((await this.clientReader.findById(companyId, clientId)) === null)
      throw new ClientNotFoundError();
    const config = await this.settings.get(companyId);
    const invoices = (await this.invoiceReader.list({ clientId, companyId })).filter(
      (invoice) =>
        invoice.currency.value === config.currencyCode && invoice.documentStatus === 'issued',
    );
    let debt = 0;
    let overdue = 0;
    let nextDue: Date | undefined;
    for (const invoice of invoices) {
      const allocated = await this.allocationReader.allocatedToInvoice(companyId, invoice.id.value);
      const outstanding = Math.max(0, invoice.totalCents - allocated);
      debt += outstanding;
      if (outstanding > 0 && invoice.dueOn < this.clock.now()) overdue += outstanding;
      if (
        outstanding > 0 &&
        invoice.dueOn >= this.clock.now() &&
        (nextDue === undefined || invoice.dueOn < nextDue)
      )
        nextDue = invoice.dueOn;
    }
    const payments = (await this.paymentReader.listAllByClient(companyId, clientId)).filter(
      (payment) =>
        payment.status === 'recorded' && payment.amount.currency.value === config.currencyCode,
    );
    const credit = payments.reduce((sum, payment) => sum + payment.unallocatedCents, 0);
    return {
      clientId,
      creditCents: credit,
      currencyCode: config.currencyCode,
      debtCents: debt,
      invoiceCount: invoices.length,
      nextDueOn: nextDue?.toISOString().slice(0, 10) ?? null,
      overdueCents: overdue,
    };
  }
}
