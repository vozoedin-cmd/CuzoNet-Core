import { toInvoiceDto, type InvoiceDto } from '../../../../dto/billing/invoice.dto.js';
import type {
  InvoiceReader,
  InvoiceListCriteria,
} from '../../../../ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { InvoiceStatusCalculator } from '../../../../../domain/billing/services/invoice-status-calculator.js';
export class ListInvoices {
  private readonly calculator = new InvoiceStatusCalculator();
  public constructor(
    private readonly reader: InvoiceReader,
    private readonly allocations: PaymentAllocationReader,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(
    criteria: Omit<InvoiceListCriteria, 'companyId'>,
  ): Promise<readonly InvoiceDto[]> {
    const companyId = this.companyContext.getCompanyId();
    const invoices = await this.reader.list({ ...criteria, companyId });
    return Promise.all(
      invoices.map(async (invoice) =>
        toInvoiceDto(
          invoice,
          this.calculator.calculate(
            invoice,
            await this.allocations.allocatedToInvoice(companyId, invoice.id.value),
            this.clock.now(),
          ),
        ),
      ),
    );
  }
}
