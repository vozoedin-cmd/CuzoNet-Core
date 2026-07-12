import type { BillingAccountReader } from '../../../../ports/billing/billing-account-reader.port.js';
import type { BillingAccountRepository } from '../../../../ports/billing/billing-account-repository.port.js';
import type { InvoiceReader } from '../../../../ports/billing/invoice-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { BillingAccountNotFoundError } from '../../../../../domain/billing/errors/billing-account-not-found.error.js';
import { BillingConflictError } from '../../../../../domain/billing/errors/billing-conflict.error.js';
export class CloseBillingAccount {
  public constructor(
    private readonly repository: BillingAccountRepository,
    private readonly reader: BillingAccountReader,
    private readonly invoiceReader: InvoiceReader,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public async execute(accountId: string): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const account = await this.reader.findById(companyId, accountId);
    if (account === null) throw new BillingAccountNotFoundError();
    const invoices = await this.invoiceReader.list({ accountId, companyId });
    if (invoices.some((invoice) => invoice.documentStatus === 'issued'))
      throw new BillingConflictError('La cuenta tiene facturas vigentes.');
    account.close(this.clock.now());
    await this.repository.save(account);
  }
}
