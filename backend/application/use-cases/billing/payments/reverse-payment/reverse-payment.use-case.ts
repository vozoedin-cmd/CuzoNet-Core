import type { BillingActorContext } from '../../../../ports/billing/billing-actor-context.port.js';
import type { PaymentReader } from '../../../../ports/billing/payment-reader.port.js';
import type { PaymentRepository } from '../../../../ports/billing/payment-repository.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { PaymentNotFoundError } from '../../../../../domain/billing/errors/payment-not-found.error.js';
import { ReversalReason } from '../../../../../domain/billing/payments/value-objects/reversal-reason.js';
export class ReversePayment {
  public constructor(
    private readonly repository: PaymentRepository,
    private readonly reader: PaymentReader,
    private readonly actor: BillingActorContext,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(input: { paymentId: string; reason: string }): Promise<void> {
    const payment = await this.reader.findById(this.companyContext.getCompanyId(), input.paymentId);
    if (payment === null) throw new PaymentNotFoundError();
    payment.reverse(this.clock.now(), this.actor.getActorId(), ReversalReason.create(input.reason));
    await this.repository.save(payment);
  }
}
