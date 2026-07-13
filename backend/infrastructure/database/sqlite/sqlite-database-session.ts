import { AsyncLocalStorage } from 'node:async_hooks';

import type BetterSqlite3 from 'better-sqlite3';
import type { Kysely } from 'kysely';

import type { DatabaseSchema } from './database-schema.js';

export class SqliteDatabaseSession {
  private readonly transactionContext = new AsyncLocalStorage<boolean>();
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly database: Kysely<DatabaseSchema>,
    private readonly connection: BetterSqlite3.Database,
  ) {}

  public execute<T>(work: (database: Kysely<DatabaseSchema>) => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore() === true) return work(this.database);
    return this.exclusive(() => work(this.database));
  }

  public transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore() === true) return work();
    return this.exclusive(async () => {
      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const result = await this.transactionContext.run(true, work);
        this.connection.exec('COMMIT');
        return result;
      } catch (error) {
        if (this.connection.inTransaction) this.connection.exec('ROLLBACK');
        throw error;
      }
    });
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: (() => void) | undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release?.();
    }
  }
}
