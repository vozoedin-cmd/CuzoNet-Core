import type { PaymentAllocationReader } from '../../../../../application/ports/billing/payment-allocation-reader.port.js';
import type { PaymentIdempotencyPort } from '../../../../../application/ports/billing/payment-idempotency.port.js';
import type {
  PaymentListCriteria,
  PaymentPage,
  PaymentReader,
} from '../../../../../application/ports/billing/payment-reader.port.js';
import type { PaymentReferenceUniquenessPort } from '../../../../../application/ports/billing/payment-reference-uniqueness.port.js';
import type { PaymentRepository } from '../../../../../application/ports/billing/payment-repository.port.js';
import type { Payment } from '../../../../../domain/billing/payments/payment.js';
import type { PaymentMethod } from '../../../../../domain/billing/payments/value-objects/payment-method.js';
import { inMemoryPaymentMapper, type PaymentRecord } from './in-memory-payment.mapper.js';
export class InMemoryPaymentRepository
  implements
    PaymentRepository,
    PaymentReader,
    PaymentAllocationReader,
    PaymentIdempotencyPort,
    PaymentReferenceUniquenessPort
{
  private readonly records = new Map<string, PaymentRecord>();
  public save(payment: Payment): Promise<void> {
    this.records.set(
      `${payment.companyId}:${payment.id.value}`,
      inMemoryPaymentMapper.toRecord(payment),
    );
    return Promise.resolve();
  }
  public findById(companyId: string, paymentId: string): Promise<Payment | null> {
    const record = this.records.get(`${companyId}:${paymentId}`);
    return Promise.resolve(record === undefined ? null : inMemoryPaymentMapper.toDomain(record));
  }
  public findByIdempotencyKey(companyId: string, key: string): Promise<Payment | null> {
    const record = [...this.records.values()].find(
      (candidate) => candidate.companyId === companyId && candidate.idempotencyKey === key,
    );
    return Promise.resolve(record === undefined ? null : inMemoryPaymentMapper.toDomain(record));
  }
  public existsExternalReference(
    companyId: string,
    method: PaymentMethod,
    reference: string,
  ): Promise<boolean> {
    return Promise.resolve(
      [...this.records.values()].some(
        (record) =>
          record.companyId === companyId &&
          record.method === method &&
          record.externalReference === reference,
      ),
    );
  }
  public allocatedToInvoice(companyId: string, invoiceId: string): Promise<number> {
    return Promise.resolve(
      [...this.records.values()]
        .filter((record) => record.companyId === companyId && record.status === 'recorded')
        .flatMap((record) => record.allocations)
        .filter((allocation) => allocation.invoiceId === invoiceId)
        .reduce((sum, allocation) => sum + allocation.amountCents, 0),
    );
  }
  public list(criteria: PaymentListCriteria): Promise<PaymentPage> {
    const filtered = [...this.records.values()]
      .filter(
        (record) =>
          record.companyId === criteria.companyId &&
          (criteria.clientId === undefined || record.clientId === criteria.clientId) &&
          (criteria.from === undefined || new Date(record.receivedAt) >= criteria.from) &&
          (criteria.to === undefined || new Date(record.receivedAt) <= criteria.to),
      )
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    const offset = (criteria.page - 1) * criteria.pageSize;
    return Promise.resolve({
      payments: filtered
        .slice(offset, offset + criteria.pageSize)
        .map(inMemoryPaymentMapper.toDomain),
      total: filtered.length,
    });
  }
  public listAllByClient(companyId: string, clientId: string): Promise<readonly Payment[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter((record) => record.companyId === companyId && record.clientId === clientId)
        .map(inMemoryPaymentMapper.toDomain),
    );
  }
}
