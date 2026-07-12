import { toInvoiceDto, type InvoiceDto } from '../../../../dto/billing/invoice.dto.js';
import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { InvoiceNotFoundError } from '../../../../../domain/billing/errors/invoice-not-found.error.js';
import { InvoiceStatusCalculator } from '../../../../../domain/billing/services/invoice-status-calculator.js';
export class GetInvoice {
  private readonly calculator = new InvoiceStatusCalculator();
  public constructor(
    private readonly reader: InvoiceReader,
    private readonly allocations: PaymentAllocationReader,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(invoiceId: string): Promise<InvoiceDto> {
    const companyId = this.companyContext.getCompanyId();
    const invoice = await this.reader.findById(companyId, invoiceId);
    if (invoice === null) throw new InvoiceNotFoundError();
    const allocated = await this.allocations.allocatedToInvoice(companyId, invoiceId);
    return toInvoiceDto(invoice, this.calculator.calculate(invoice, allocated, this.clock.now()));
  }
}
