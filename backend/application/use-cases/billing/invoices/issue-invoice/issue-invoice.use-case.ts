import { toInvoiceDto, type InvoiceDto } from '../../../../dto/billing/invoice.dto.js';
import type { BillingAccountReader } from '../../../../ports/billing/billing-account-reader.port.js';
import type { DocumentNumberGenerator } from '../../../../ports/billing/document-number-generator.port.js';
import type { InvoiceRepository } from '../../../../ports/billing/invoice-repository.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../../ports/id-generator.port.js';
import { BillingAccountNotFoundError } from '../../../../../domain/billing/errors/billing-account-not-found.error.js';
import { BillingConflictError } from '../../../../../domain/billing/errors/billing-conflict.error.js';
import { Invoice } from '../../../../../domain/billing/invoices/invoice.js';
import { InvoiceLine } from '../../../../../domain/billing/invoices/invoice-line.js';
import { InvoiceId } from '../../../../../domain/billing/invoices/value-objects/invoice-id.js';
import { InvoiceDescription } from '../../../../../domain/billing/invoices/value-objects/invoice-description.js';
import { InvoiceDueDate } from '../../../../../domain/billing/invoices/value-objects/invoice-due-date.js';
import { InvoiceLineId } from '../../../../../domain/billing/invoices/value-objects/invoice-line-id.js';
import {
  createInvoiceLineType,
  type InvoiceLineType,
} from '../../../../../domain/billing/invoices/value-objects/invoice-line-type.js';
import { InvoiceNumber } from '../../../../../domain/billing/invoices/value-objects/invoice-number.js';
import { Money } from '../../../../../domain/billing/shared/money.js';
export interface IssueInvoiceInput {
  accountId: string;
  dueOn: string;
  issuedOn: string;
  lines: readonly { amountCents: number; description: string; type: InvoiceLineType }[];
}
export class IssueInvoice {
  public constructor(
    private readonly accounts: BillingAccountReader,
    private readonly repository: InvoiceRepository,
    private readonly numberGenerator: DocumentNumberGenerator,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: IssueInvoiceInput): Promise<InvoiceDto> {
    const companyId = this.companyContext.getCompanyId();
    const account = await this.accounts.findById(companyId, input.accountId);
    if (account === null) throw new BillingAccountNotFoundError();
    if (account.status !== 'active')
      throw new BillingConflictError('La cuenta debe estar activa para emitir una factura.');
    const issuedOn = new Date(input.issuedOn);
    const invoice = Invoice.issue({
      billingAccountId: account.id,
      clientId: account.clientId,
      companyId,
      createdAt: this.clock.now(),
      currency: account.currency,
      dueOn: InvoiceDueDate.create(new Date(input.dueOn), issuedOn),
      id: InvoiceId.create(this.idGenerator.generate()),
      issuedOn,
      lines: input.lines.map((line) =>
        InvoiceLine.create({
          amount: Money.create(line.amountCents, account.currency),
          description: InvoiceDescription.create(line.description),
          id: InvoiceLineId.create(this.idGenerator.generate()),
          period: undefined,
          type: createInvoiceLineType(line.type),
        }),
      ),
      number: InvoiceNumber.create(await this.numberGenerator.nextInvoiceNumber(companyId)),
    });
    await this.repository.save(invoice);
    return toInvoiceDto(invoice, 'open');
  }
}
