import { createHash } from 'node:crypto';

import type BetterSqlite3 from 'better-sqlite3';

import { migrations } from './migration-registry.js';
import type { Migration } from './migration.js';

export class MigrationRunner {
  public constructor(
    private readonly connection: BetterSqlite3.Database,
    private readonly clock: { now(): Date } = { now: () => new Date() },
  ) {}

  public migrate(): void {
    this.ensureMigrationTable();
    for (const migration of migrations) this.apply(migration);
  }

  public currentVersion(): number {
    this.ensureMigrationTable();
    const row = this.connection
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as { version: number };
    return row.version;
  }

  private ensureMigrationTable(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  private apply(migration: Migration): void {
    const checksum = createHash('sha256').update(migration.sql).digest('hex');
    const applied = this.connection
      .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
      .get(migration.version) as { checksum: string } | undefined;
    if (applied !== undefined) {
      if (applied.checksum !== checksum)
        throw new Error(`Migration ${migration.version} checksum does not match.`);
      return;
    }

    this.connection.exec('BEGIN IMMEDIATE');
    try {
      migration.sql
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
        .forEach((statement) => this.connection.exec(statement));
      const appliedAt = this.clock.now().toISOString();
      this.connection
        .prepare(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        )
        .run(migration.version, migration.name, checksum, appliedAt);
      this.connection
        .prepare(
          'UPDATE database_metadata SET schema_version = ?, updated_at = ? WHERE id = 1',
        )
        .run(migration.version, appliedAt);
      this.connection.exec('COMMIT');
    } catch (error) {
      if (this.connection.inTransaction) this.connection.exec('ROLLBACK');
      throw error;
    }
  }
}
