import {
  toPaymentDto,
  type PaymentDto,
  type RecordPaymentInput,
} from '../../../../dto/billing/payment.dto.js';
import type { BillingActorContext } from '../../../../ports/billing/billing-actor-context.port.js';
import type { BillingOutboxPort } from '../../../../ports/billing/billing-outbox.port.js';
import type { BillingUnitOfWork } from '../../../../ports/billing/billing-unit-of-work.port.js';
import type { ClientBillingReader } from '../../../../ports/billing/client-billing-reader.port.js';
import type { CompanyBillingSettingsPort } from '../../../../ports/billing/company-billing-settings.port.js';
import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { PaymentAllocationReader } from '../../../../ports/billing/payment-allocation-reader.port.js';
import type { PaymentIdempotencyPort } from '../../../../ports/billing/payment-idempotency.port.js';
import type { PaymentReferenceUniquenessPort } from '../../../../ports/billing/payment-reference-uniqueness.port.js';
import type { PaymentRepository } from '../../../../ports/billing/payment-repository.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../../ports/id-generator.port.js';
import { ClientNotFoundError } from '../../../../../domain/clients/errors/client-not-found.error.js';
import { BillingConflictError } from '../../../../../domain/billing/errors/billing-conflict.error.js';
import { InvoiceNotFoundError } from '../../../../../domain/billing/errors/invoice-not-found.error.js';
import { Payment } from '../../../../../domain/billing/payments/payment.js';
import { PaymentAllocation } from '../../../../../domain/billing/payments/payment-allocation.js';
import { AllocatedMoney } from '../../../../../domain/billing/payments/value-objects/allocated-money.js';
import { ExternalPaymentReference } from '../../../../../domain/billing/payments/value-objects/external-payment-reference.js';
import { PaymentAllocationId } from '../../../../../domain/billing/payments/value-objects/payment-allocation-id.js';
import { PaymentId } from '../../../../../domain/billing/payments/value-objects/payment-id.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { Money } from '../../../../../domain/billing/shared/money.js';

export class RecordPayment {
  public constructor(
    private readonly repository: PaymentRepository,
    private readonly reader: PaymentIdempotencyPort,
    private readonly references: PaymentReferenceUniquenessPort,
    private readonly invoiceReader: InvoiceReader,
    private readonly allocationReader: PaymentAllocationReader,
    private readonly clientReader: ClientBillingReader,
    private readonly settings: CompanyBillingSettingsPort,
    private readonly outbox: BillingOutboxPort,
    private readonly unitOfWork: BillingUnitOfWork,
    private readonly companyContext: CompanyContext,
    private readonly actorContext: BillingActorContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: RecordPaymentInput): Promise<PaymentDto> {
    const companyId = this.companyContext.getCompanyId();
    const existing = await this.reader.findByIdempotencyKey(companyId, input.idempotencyKey);
    if (existing !== null) return toPaymentDto(existing);
    if ((await this.clientReader.findById(companyId, input.clientId)) === null)
      throw new ClientNotFoundError();
    const config = await this.settings.get(companyId);
    const currency = CurrencyCode.create(input.currencyCode);
    if (currency.value !== config.currencyCode)
      throw new BillingConflictError('El pago debe usar la moneda base de la empresa.');
    if (
      input.externalReference !== undefined &&
      (await this.references.existsExternalReference(
        companyId,
        input.method,
        input.externalReference,
      ))
    )
      throw new BillingConflictError('La referencia externa ya fue registrada.');
    const allocations: PaymentAllocation[] = [];
    const accountIds = new Set<string>();
    for (const item of input.allocations ?? []) {
      const invoice = await this.invoiceReader.findById(companyId, item.invoiceId);
      if (invoice === null) throw new InvoiceNotFoundError();
      if (
        invoice.clientId !== input.clientId ||
        invoice.currency.value !== currency.value ||
        invoice.documentStatus !== 'issued'
      )
        throw new BillingConflictError('La factura no es elegible para el pago.');
      const alreadyAllocated = await this.allocationReader.allocatedToInvoice(
        companyId,
        invoice.id.value,
      );
      if (item.amountCents > invoice.totalCents - alreadyAllocated)
        throw new BillingConflictError('La asignación supera el saldo pendiente de la factura.');
      accountIds.add(invoice.billingAccountId.value);
      allocations.push(
        PaymentAllocation.create({
          allocatedAt: this.clock.now(),
          amount: AllocatedMoney.create(item.amountCents, currency),
          billingAccountId: invoice.billingAccountId.value,
          id: PaymentAllocationId.create(this.idGenerator.generate()),
          invoiceId: invoice.id,
        }),
      );
    }
    const payment = Payment.record({
      allocations,
      amount: Money.positive(input.amountCents, currency),
      billingAccountId: accountIds.size === 1 ? [...accountIds][0]! : null,
      causationId: input.causationId,
      clientId: input.clientId,
      companyId,
      correlationId: input.correlationId,
      eventId: this.idGenerator.generate(),
      externalReference:
        input.externalReference === undefined
          ? undefined
          : ExternalPaymentReference.create(input.externalReference),
      id: PaymentId.create(this.idGenerator.generate()),
      idempotencyKey: input.idempotencyKey,
      method: input.method,
      receivedAt: new Date(input.receivedAt),
      receivedBy: this.actorContext.getActorId(),
      recordedAt: this.clock.now(),
    });
    const events = payment.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.repository.save(payment);
      await this.outbox.append(events);
    });
    return toPaymentDto(payment);
  }
}
