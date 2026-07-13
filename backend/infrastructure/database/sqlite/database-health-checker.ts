import type BetterSqlite3 from 'better-sqlite3';

export interface DatabaseHealthResult {
  foreignKeyViolations: number;
  healthy: boolean;
  integrity: string;
}

export class DatabaseHealthChecker {
  public constructor(private readonly connection: BetterSqlite3.Database) {}

  public check(): DatabaseHealthResult {
    const integrityRows = this.connection.pragma('integrity_check') as { integrity_check: string }[];
    const foreignKeyRows = this.connection.pragma('foreign_key_check') as unknown[];
    const integrity = integrityRows.map((row) => row.integrity_check).join('; ');
    return {
      foreignKeyViolations: foreignKeyRows.length,
      healthy: integrity === 'ok' && foreignKeyRows.length === 0,
      integrity,
    };
  }

  public assertHealthy(): void {
    const result = this.check();
    if (!result.healthy)
      throw new Error(
        `SQLite integrity check failed: ${result.integrity}; foreign key violations: ${result.foreignKeyViolations}`,
      );
  }
}
