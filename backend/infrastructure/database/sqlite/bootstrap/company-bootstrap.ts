import type { IdGenerator } from '../../../../application/ports/id-generator.port.js';
import type { SqliteDatabaseSession } from '../sqlite-database-session.js';

export interface CompanyBootstrapOptions {
  currencyCode: string;
  displayName: string;
  legalName: string;
  timezone: string;
}

export class CompanyBootstrap {
  public constructor(
    private readonly session: SqliteDatabaseSession,
    private readonly idGenerator: IdGenerator,
  ) {}

  public bootstrap(options: CompanyBootstrapOptions, now: Date): Promise<string> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        const existing = await database
          .selectFrom('companies')
          .select(['id'])
          .orderBy('created_at', 'asc')
          .execute();
        if (existing.length > 0) return existing[0]!.id;

        const id = this.idGenerator.generate();
        await database
          .insertInto('companies')
          .values({
            created_at: now.toISOString(),
            currency_code: options.currencyCode,
            display_name: options.displayName,
            id,
            legal_name: options.legalName,
            status: 'active',
            timezone: options.timezone,
          })
          .execute();
        return id;
      }),
    );
  }
}
