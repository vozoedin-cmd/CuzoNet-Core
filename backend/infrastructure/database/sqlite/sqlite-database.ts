import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import type { DatabaseSchema } from './database-schema.js';
import { SqliteDatabaseSession } from './sqlite-database-session.js';

export interface SqliteDatabaseOptions {
  busyTimeoutMs: number;
  path: string;
}

export class SqliteDatabase {
  public readonly connection: BetterSqlite3.Database;
  public readonly kysely: Kysely<DatabaseSchema>;
  public readonly session: SqliteDatabaseSession;

  public constructor(options: SqliteDatabaseOptions) {
    if (options.path !== ':memory:') mkdirSync(dirname(options.path), { recursive: true });
    this.connection = new BetterSqlite3(options.path);
    this.connection.pragma('foreign_keys = ON');
    this.connection.pragma(`busy_timeout = ${options.busyTimeoutMs}`);
    this.connection.pragma('journal_mode = WAL');
    this.connection.pragma('synchronous = FULL');
    this.connection.pragma('wal_autocheckpoint = 1000');
    this.kysely = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: this.connection }),
    });
    this.session = new SqliteDatabaseSession(this.kysely, this.connection);
  }

  public async close(): Promise<void> {
    await this.kysely.destroy();
    if (this.connection.open) this.connection.close();
  }
}
