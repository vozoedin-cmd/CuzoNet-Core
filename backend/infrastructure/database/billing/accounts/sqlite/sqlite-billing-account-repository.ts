import type { BillingAccountReader } from '../../../../../application/ports/billing/billing-account-reader.port.js';
import type { BillingAccountRepository } from '../../../../../application/ports/billing/billing-account-repository.port.js';
import type { BillingAccount } from '../../../../../domain/billing/accounts/billing-account.js';
import type { SqliteDatabaseSession } from '../../../sqlite/sqlite-database-session.js';
import { sqliteBillingAccountMapper } from './sqlite-billing-account.mapper.js';

export class SqliteBillingAccountRepository
  implements BillingAccountRepository, BillingAccountReader
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(account: BillingAccount): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('billing_accounts')
        .values({
          client_id: account.clientId,
          closed_at: account.closedAt?.toISOString() ?? null,
          company_id: account.companyId,
          currency_code: account.currency.value,
          id: account.id.value,
          opened_at: account.openedAt.toISOString(),
          service_id: account.serviceId.value,
          status: account.status,
        })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            closed_at: account.closedAt?.toISOString() ?? null,
            status: account.status,
          }),
        )
        .execute();
    });
  }

  public hasActive(companyId: string, serviceId: string, currencyCode: string): Promise<boolean> {
    return this.session.execute(async (database) =>
      Boolean(
        await database
          .selectFrom('billing_accounts')
          .select('id')
          .where('company_id', '=', companyId)
          .where('service_id', '=', serviceId)
          .where('currency_code', '=', currencyCode)
          .where('status', '=', 'active')
          .executeTakeFirst(),
      ),
    );
  }

  public findById(companyId: string, accountId: string): Promise<BillingAccount | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('billing_accounts')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', accountId)
        .executeTakeFirst();
      return row === undefined ? null : sqliteBillingAccountMapper.toDomain(row);
    });
  }

  public listByClient(
    companyId: string,
    clientId: string,
    currencyCode?: string,
  ): Promise<readonly BillingAccount[]> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('billing_accounts')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('client_id', '=', clientId);
      if (currencyCode !== undefined) query = query.where('currency_code', '=', currencyCode);
      return (await query.orderBy('opened_at', 'asc').execute()).map(
        sqliteBillingAccountMapper.toDomain,
      );
    });
  }
}
