import { toPaymentDto, type PaymentDto } from '../../../../dto/billing/payment.dto.js';
import type { PaymentReader } from '../../../../ports/billing/payment-reader.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { PaymentNotFoundError } from '../../../../../domain/billing/errors/payment-not-found.error.js';
export class GetPayment {
  public constructor(
    private readonly reader: PaymentReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(paymentId: string): Promise<PaymentDto> {
    const payment = await this.reader.findById(this.companyContext.getCompanyId(), paymentId);
    if (payment === null) throw new PaymentNotFoundError();
    return toPaymentDto(payment);
  }
}
