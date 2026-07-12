import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { PaymentReader } from '../../../../ports/billing/payment-reader.port.js';
import type { PaymentRepository } from '../../../../ports/billing/payment-repository.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../../ports/id-generator.port.js';
import { BillingConflictError } from '../../../../../domain/billing/errors/billing-conflict.error.js';
import { InvoiceNotFoundError } from '../../../../../domain/billing/errors/invoice-not-found.error.js';
import { PaymentNotFoundError } from '../../../../../domain/billing/errors/payment-not-found.error.js';
import { PaymentAllocation } from '../../../../../domain/billing/payments/payment-allocation.js';
import { AllocatedMoney } from '../../../../../domain/billing/payments/value-objects/allocated-money.js';
import { PaymentAllocationId } from '../../../../../domain/billing/payments/value-objects/payment-allocation-id.js';
export class AllocatePayment {
  public constructor(
    private readonly repository: PaymentRepository,
    private readonly reader: PaymentReader,
    private readonly invoiceReader: InvoiceReader,
    private readonly allocationReader: PaymentAllocationReader,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: {
    amountCents: number;
    invoiceId: string;
    paymentId: string;
  }): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const payment = await this.reader.findById(companyId, input.paymentId);
    if (payment === null) throw new PaymentNotFoundError();
    const invoice = await this.invoiceReader.findById(companyId, input.invoiceId);
    if (invoice === null) throw new InvoiceNotFoundError();
    if (
      invoice.clientId !== payment.clientId ||
      invoice.currency.value !== payment.amount.currency.value
    )
      throw new BillingConflictError('Pago y factura no son compatibles.');
    const allocated = await this.allocationReader.allocatedToInvoice(companyId, invoice.id.value);
    if (input.amountCents > invoice.totalCents - allocated)
      throw new BillingConflictError('La asignación supera el saldo de la factura.');
    payment.allocate(
      PaymentAllocation.create({
        allocatedAt: this.clock.now(),
        amount: AllocatedMoney.create(input.amountCents, payment.amount.currency),
        billingAccountId: invoice.billingAccountId.value,
        id: PaymentAllocationId.create(this.idGenerator.generate()),
        invoiceId: invoice.id,
      }),
    );
    await this.repository.save(payment);
  }
}
