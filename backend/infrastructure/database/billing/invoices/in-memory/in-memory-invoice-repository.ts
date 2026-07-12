import type {
  InvoiceListCriteria,
  InvoiceReader,
} from '../../../../../application/ports/billing/invoice-reader.port.js';
import type { InvoiceRepository } from '../../../../../application/ports/billing/invoice-repository.port.js';
import type { Invoice } from '../../../../../domain/billing/invoices/invoice.js';
import { inMemoryInvoiceMapper, type InvoiceRecord } from './in-memory-invoice.mapper.js';
export class InMemoryInvoiceRepository implements InvoiceRepository, InvoiceReader {
  private readonly records = new Map<string, InvoiceRecord>();
  public save(invoice: Invoice): Promise<void> {
    this.records.set(
      `${invoice.companyId}:${invoice.id.value}`,
      inMemoryInvoiceMapper.toRecord(invoice),
    );
    return Promise.resolve();
  }
  public findById(companyId: string, invoiceId: string): Promise<Invoice | null> {
    const record = this.records.get(`${companyId}:${invoiceId}`);
    return Promise.resolve(record === undefined ? null : inMemoryInvoiceMapper.toDomain(record));
  }
  public list(criteria: InvoiceListCriteria): Promise<readonly Invoice[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter(
          (record) =>
            record.companyId === criteria.companyId &&
            (criteria.accountId === undefined || record.billingAccountId === criteria.accountId) &&
            (criteria.clientId === undefined || record.clientId === criteria.clientId) &&
            (criteria.from === undefined || new Date(record.issuedOn) >= criteria.from) &&
            (criteria.to === undefined || new Date(record.issuedOn) <= criteria.to),
        )
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))
        .map(inMemoryInvoiceMapper.toDomain),
    );
  }
}
