import {
  toPaymentDto,
  type ListPaymentsInput,
  type PaymentPageDto,
} from '../../../../dto/billing/payment.dto.js';
import type { PaymentReader } from '../../../../ports/billing/payment-reader.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
export class ListPayments {
  public constructor(
    private readonly reader: PaymentReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(input: ListPaymentsInput): Promise<PaymentPageDto> {
    const page = await this.reader.list({
      companyId: this.companyContext.getCompanyId(),
      page: input.page,
      pageSize: input.pageSize,
      ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
      ...(input.from === undefined ? {} : { from: new Date(`${input.from}T00:00:00.000Z`) }),
      ...(input.to === undefined ? {} : { to: new Date(`${input.to}T23:59:59.999Z`) }),
    });
    return {
      data: page.payments.map(toPaymentDto),
      page: input.page,
      pageSize: input.pageSize,
      total: page.total,
    };
  }
}
