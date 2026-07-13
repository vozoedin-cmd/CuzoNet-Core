import type {
  CompanyBillingSettings,
  CompanyBillingSettingsPort,
} from '../../../application/ports/billing/company-billing-settings.port.js';
import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';

export class SqliteCompanyBillingSettings implements CompanyBillingSettingsPort {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public get(companyId: string): Promise<CompanyBillingSettings> {
    return this.session.execute(async (database) => {
      const company = await database
        .selectFrom('companies')
        .select(['currency_code', 'timezone'])
        .where('id', '=', companyId)
        .executeTakeFirstOrThrow();
      return { currencyCode: company.currency_code, timezone: company.timezone };
    });
  }
}
