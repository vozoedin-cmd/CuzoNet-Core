import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { InvoiceRepository } from '../../../../ports/billing/invoice-repository.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { InvoiceNotFoundError } from '../../../../../domain/billing/errors/invoice-not-found.error.js';
import { CancellationReason } from '../../../../../domain/billing/invoices/value-objects/cancellation-reason.js';
export class CancelInvoice {
  public constructor(
    private readonly repository: InvoiceRepository,
    private readonly reader: InvoiceReader,
    private readonly allocations: PaymentAllocationReader,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(input: { invoiceId: string; reason: string }): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const invoice = await this.reader.findById(companyId, input.invoiceId);
    if (invoice === null) throw new InvoiceNotFoundError();
    invoice.cancel(
      this.clock.now(),
      CancellationReason.create(input.reason),
      await this.allocations.allocatedToInvoice(companyId, invoice.id.value),
    );
    await this.repository.save(invoice);
  }
}
