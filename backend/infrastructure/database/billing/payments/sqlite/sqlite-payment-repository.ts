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
import { sql } from 'kysely';
import type { PaymentTable } from '../../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../../sqlite/sqlite-database-session.js';
import { sqlitePaymentMapper } from './sqlite-payment.mapper.js';

export class SqlitePaymentRepository
  implements
    PaymentRepository,
    PaymentReader,
    PaymentAllocationReader,
    PaymentIdempotencyPort,
    PaymentReferenceUniquenessPort
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(payment: Payment): Promise<void> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        await database
          .insertInto('payments')
          .values({
            amount_cents: payment.amount.cents,
            client_id: payment.clientId,
            company_id: payment.companyId,
            currency_code: payment.amount.currency.value,
            external_reference: payment.externalReference?.value ?? null,
            id: payment.id.value,
            idempotency_key: payment.idempotencyKey,
            method: payment.method,
            received_at: payment.receivedAt.toISOString(),
            received_by: payment.receivedBy,
            recorded_at: payment.recordedAt.toISOString(),
            reversal_reason: payment.reversal?.reason.value ?? null,
            reversed_at: payment.reversal?.reversedAt.toISOString() ?? null,
            reversed_by: payment.reversal?.reversedBy ?? null,
            status: payment.status,
          })
          .onConflict((conflict) =>
            conflict.column('id').doUpdateSet({
              reversal_reason: payment.reversal?.reason.value ?? null,
              reversed_at: payment.reversal?.reversedAt.toISOString() ?? null,
              reversed_by: payment.reversal?.reversedBy ?? null,
              status: payment.status,
            }),
          )
          .execute();
        await database
          .deleteFrom('payment_allocations')
          .where('payment_id', '=', payment.id.value)
          .execute();
        if (payment.allocations.length > 0)
          await database
            .insertInto('payment_allocations')
            .values(
              payment.allocations.map((allocation) => ({
                allocated_at: allocation.allocatedAt.toISOString(),
                amount_cents: allocation.amount.cents,
                billing_account_id: allocation.billingAccountId,
                id: allocation.id.value,
                invoice_id: allocation.invoiceId.value,
                payment_id: payment.id.value,
              })),
            )
            .execute();
      }),
    );
  }

  public findById(companyId: string, paymentId: string): Promise<Payment | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('payments')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', paymentId)
        .executeTakeFirst();
      return row === undefined ? null : this.hydrate(database, row);
    });
  }

  public findByIdempotencyKey(companyId: string, key: string): Promise<Payment | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('payments')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('idempotency_key', '=', key)
        .executeTakeFirst();
      return row === undefined ? null : this.hydrate(database, row);
    });
  }

  public existsExternalReference(
    companyId: string,
    method: PaymentMethod,
    reference: string,
  ): Promise<boolean> {
    return this.session.execute(async (database) =>
      Boolean(
        await database
          .selectFrom('payments')
          .select('id')
          .where('company_id', '=', companyId)
          .where('method', '=', method)
          .where('external_reference', '=', reference)
          .executeTakeFirst(),
      ),
    );
  }

  public allocatedToInvoice(companyId: string, invoiceId: string): Promise<number> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('payment_allocations as allocation')
        .innerJoin('payments as payment', 'payment.id', 'allocation.payment_id')
        .select(sql<number>`coalesce(sum(allocation.amount_cents), 0)`.as('total'))
        .where('payment.company_id', '=', companyId)
        .where('payment.status', '=', 'recorded')
        .where('allocation.invoice_id', '=', invoiceId)
        .executeTakeFirstOrThrow();
      return Number(row.total);
    });
  }

  public list(criteria: PaymentListCriteria): Promise<PaymentPage> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('payments')
        .selectAll()
        .where('company_id', '=', criteria.companyId);
      let count = database
        .selectFrom('payments')
        .select((expression) => expression.fn.countAll<number>().as('total'))
        .where('company_id', '=', criteria.companyId);
      if (criteria.clientId !== undefined) {
        query = query.where('client_id', '=', criteria.clientId);
        count = count.where('client_id', '=', criteria.clientId);
      }
      if (criteria.from !== undefined) {
        query = query.where('received_at', '>=', criteria.from.toISOString());
        count = count.where('received_at', '>=', criteria.from.toISOString());
      }
      if (criteria.to !== undefined) {
        query = query.where('received_at', '<=', criteria.to.toISOString());
        count = count.where('received_at', '<=', criteria.to.toISOString());
      }
      const [rows, total] = await Promise.all([
        query
          .orderBy('received_at', 'desc')
          .orderBy('id', 'asc')
          .limit(criteria.pageSize)
          .offset((criteria.page - 1) * criteria.pageSize)
          .execute(),
        count.executeTakeFirstOrThrow(),
      ]);
      return {
        payments: await Promise.all(rows.map((row) => this.hydrate(database, row))),
        total: Number(total.total),
      };
    });
  }

  public listAllByClient(companyId: string, clientId: string): Promise<readonly Payment[]> {
    return this.session.execute(async (database) => {
      const rows = await database
        .selectFrom('payments')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('client_id', '=', clientId)
        .orderBy('received_at', 'asc')
        .execute();
      return Promise.all(rows.map((row) => this.hydrate(database, row)));
    });
  }

  private async hydrate(
    database: Parameters<Parameters<SqliteDatabaseSession['execute']>[0]>[0],
    payment: PaymentTable,
  ): Promise<Payment> {
    const allocations = await database
      .selectFrom('payment_allocations')
      .selectAll()
      .where('payment_id', '=', payment.id)
      .execute();
    return sqlitePaymentMapper.toDomain(payment, allocations);
  }
}
