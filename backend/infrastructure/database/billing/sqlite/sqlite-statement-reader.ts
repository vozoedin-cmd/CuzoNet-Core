import type {
  AccountStatementDto,
  StatementEntryDto,
} from '../../../../application/dto/billing/statement.dto.js';
import type { StatementReader } from '../../../../application/ports/billing/statement-reader.port.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';

export class SqliteStatementReader implements StatementReader {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public getAccountStatement(
    companyId: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AccountStatementDto | null> {
    return this.session.execute(async (database) => {
      const account = await database
        .selectFrom('billing_accounts')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (account === undefined) return null;
      const [invoices, allocations] = await Promise.all([
        database
          .selectFrom('invoices')
          .selectAll()
          .where('company_id', '=', companyId)
          .where('billing_account_id', '=', accountId)
          .execute(),
        database
          .selectFrom('payment_allocations as allocation')
          .innerJoin('payments as payment', 'payment.id', 'allocation.payment_id')
          .select([
            'allocation.amount_cents',
            'allocation.billing_account_id',
            'allocation.invoice_id',
            'payment.id as payment_id',
            'payment.received_at',
            'payment.status',
          ])
          .where('payment.company_id', '=', companyId)
          .where('allocation.billing_account_id', '=', accountId)
          .execute(),
      ]);
      const entries: StatementEntryDto[] = [];
      let debt = 0;
      for (const invoice of invoices) {
        if (invoice.document_status === 'cancelled') continue;
        const allocated = allocations
          .filter((allocation) => allocation.invoice_id === invoice.id && allocation.status === 'recorded')
          .reduce((sum, allocation) => sum + allocation.amount_cents, 0);
        debt += Math.max(0, invoice.total_cents - allocated);
        if (invoice.issued_on >= from.toISOString() && invoice.issued_on <= to.toISOString())
          entries.push({
            amountCents: invoice.total_cents,
            occurredAt: invoice.issued_on,
            referenceId: invoice.id,
            type: 'invoice',
          });
      }
      const payments = new Map<string, (typeof allocations)[number][]>();
      for (const allocation of allocations) {
        const current = payments.get(allocation.payment_id) ?? [];
        current.push(allocation);
        payments.set(allocation.payment_id, current);
      }
      for (const [paymentId, paymentAllocations] of payments) {
        const payment = paymentAllocations[0]!;
        if (payment.received_at < from.toISOString() || payment.received_at > to.toISOString())
          continue;
        const amount = paymentAllocations.reduce(
          (sum, allocation) => sum + allocation.amount_cents,
          0,
        );
        entries.push({
          amountCents: payment.status === 'recorded' ? -amount : amount,
          occurredAt: payment.received_at,
          referenceId: paymentId,
          type: payment.status === 'recorded' ? 'payment' : 'reversal',
        });
      }
      entries.sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.referenceId.localeCompare(right.referenceId),
      );
      return {
        accountId,
        closingCreditCents: 0,
        closingDebtCents: debt,
        currencyCode: account.currency_code,
        entries,
        from: from.toISOString(),
        to: to.toISOString(),
      };
    });
  }
}
