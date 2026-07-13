import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { DatabaseHealthChecker } from '../database-health-checker.js';

export class SqliteBackup {
  public constructor(private readonly connection: BetterSqlite3.Database) {}

  public async create(destination: string): Promise<void> {
    if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}`;
    try {
      await this.connection.backup(temporary);
      const verification = new BetterSqlite3(temporary, { readonly: true });
      try {
        new DatabaseHealthChecker(verification).assertHealthy();
      } finally {
        verification.close();
      }
      renameSync(temporary, destination);
    } catch (error) {
      if (existsSync(temporary)) rmSync(temporary, { force: true });
      throw error;
    }
  }
}
