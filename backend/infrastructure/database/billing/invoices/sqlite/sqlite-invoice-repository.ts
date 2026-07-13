import type {
  InvoiceListCriteria,
  InvoiceReader,
} from '../../../../../application/ports/billing/invoice-reader.port.js';
import type { InvoiceRepository } from '../../../../../application/ports/billing/invoice-repository.port.js';
import type { Invoice } from '../../../../../domain/billing/invoices/invoice.js';
import type { InvoiceTable } from '../../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../../sqlite/sqlite-database-session.js';
import { sqliteInvoiceMapper } from './sqlite-invoice.mapper.js';

export class SqliteInvoiceRepository implements InvoiceRepository, InvoiceReader {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(invoice: Invoice): Promise<void> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        await database
          .insertInto('invoices')
          .values({
            billing_account_id: invoice.billingAccountId.value,
            cancelled_at: invoice.cancelledAt?.toISOString() ?? null,
            cancellation_reason: invoice.cancellationReason?.value ?? null,
            client_id: invoice.clientId,
            company_id: invoice.companyId,
            created_at: invoice.createdAt.toISOString(),
            currency_code: invoice.currency.value,
            document_status: invoice.documentStatus,
            due_on: invoice.dueOn.toISOString(),
            id: invoice.id.value,
            issued_on: invoice.issuedOn.toISOString(),
            number: invoice.number.value,
            total_cents: invoice.totalCents,
          })
          .onConflict((conflict) =>
            conflict.column('id').doUpdateSet({
              cancelled_at: invoice.cancelledAt?.toISOString() ?? null,
              cancellation_reason: invoice.cancellationReason?.value ?? null,
              document_status: invoice.documentStatus,
            }),
          )
          .execute();
        await database.deleteFrom('invoice_items').where('invoice_id', '=', invoice.id.value).execute();
        await database
          .insertInto('invoice_items')
          .values(
            invoice.lines.map((line, position) => ({
              amount_cents: line.amount.cents,
              description: line.description.value,
              id: line.id.value,
              invoice_id: invoice.id.value,
              item_type: line.type,
              period_end: line.period?.end.toISOString() ?? null,
              period_start: line.period?.start.toISOString() ?? null,
              position,
            })),
          )
          .execute();
      }),
    );
  }

  public findById(companyId: string, invoiceId: string): Promise<Invoice | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('invoices')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', invoiceId)
        .executeTakeFirst();
      return row === undefined ? null : this.hydrate(database, row);
    });
  }

  public list(criteria: InvoiceListCriteria): Promise<readonly Invoice[]> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('invoices')
        .selectAll()
        .where('company_id', '=', criteria.companyId);
      if (criteria.accountId !== undefined)
        query = query.where('billing_account_id', '=', criteria.accountId);
      if (criteria.clientId !== undefined) query = query.where('client_id', '=', criteria.clientId);
      if (criteria.from !== undefined)
        query = query.where('issued_on', '>=', criteria.from.toISOString());
      if (criteria.to !== undefined) query = query.where('issued_on', '<=', criteria.to.toISOString());
      const rows = await query.orderBy('issued_on', 'desc').orderBy('id', 'asc').execute();
      return Promise.all(rows.map((row) => this.hydrate(database, row)));
    });
  }

  private async hydrate(
    database: Parameters<Parameters<SqliteDatabaseSession['execute']>[0]>[0],
    invoice: InvoiceTable,
  ): Promise<Invoice> {
    const items = await database
      .selectFrom('invoice_items')
      .selectAll()
      .where('invoice_id', '=', invoice.id)
      .execute();
    return sqliteInvoiceMapper.toDomain(invoice, items);
  }
}
