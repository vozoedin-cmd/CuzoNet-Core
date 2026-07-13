import type { Selectable } from 'kysely';

import type { DatabaseMetadataTable } from './database-schema.js';
import type { SqliteDatabaseSession } from './sqlite-database-session.js';

export type DatabaseMetadata = Selectable<DatabaseMetadataTable>;

export class DatabaseMetadataRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public get(): Promise<DatabaseMetadata | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('database_metadata')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst();
      return row ?? null;
    });
  }
}
