import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { SqliteBackup } from '../../../backend/infrastructure/database/sqlite/backup/sqlite-backup.js';
import { DatabaseHealthChecker } from '../../../backend/infrastructure/database/sqlite/database-health-checker.js';
import { DatabaseMetadataRepository } from '../../../backend/infrastructure/database/sqlite/database-metadata.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

describe('SQLite foundation integration', () => {
  let directory: string;
  let database: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-sqlite-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('aplica migraciones de forma idempotente y registra todas las versiones', async () => {
    const runner = new MigrationRunner(database.connection, {
      now: () => new Date('2026-07-12T12:00:00.000Z'),
    });

    runner.migrate();
    runner.migrate();

    const metadata = await new DatabaseMetadataRepository(database.session).get();
    const migrations = database.connection
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as { version: number }[];
    const expiresIndex = database.connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idempotency_keys_expires_at_idx'",
      )
      .get();

    expect(runner.currentVersion()).toBe(19);
    expect(migrations.map(({ version }) => version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    expect(metadata).toMatchObject({ database_version: 1, schema_version: 19 });
    expect(expiresIndex).toBeDefined();
  });

  it('configura WAL, foreign keys y busy_timeout', () => {
    expect(database.connection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(database.connection.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.connection.pragma('busy_timeout', { simple: true })).toBe(2_500);
  });

  it('crea una sola empresa exclusivamente cuando companies estÃ¡ vacÃ­a', async () => {
    new MigrationRunner(database.connection).migrate();
    const bootstrap = new CompanyBootstrap(database.session, new UuidV7IdGenerator());
    const first = await bootstrap.bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      new Date('2026-07-12T12:00:00.000Z'),
    );
    const second = await bootstrap.bootstrap(
      {
        currencyCode: 'USD',
        displayName: 'Ignored',
        legalName: 'Ignored',
        timezone: 'UTC',
      },
      new Date('2026-07-12T13:00:00.000Z'),
    );
    const companies = database.connection.prepare('SELECT * FROM companies').all();

    expect(second).toBe(first);
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ currency_code: 'GTQ', display_name: 'CuzoNet' });
  });

  it('valida integrity_check y foreign_key_check por separado', () => {
    new MigrationRunner(database.connection).migrate();

    expect(new DatabaseHealthChecker(database.connection).check()).toEqual({
      foreignKeyViolations: 0,
      healthy: true,
      integrity: 'ok',
    });
  });

  it('crea un backup consistente sin sobrescribir destinos existentes', async () => {
    new MigrationRunner(database.connection).migrate();
    const destination = join(directory, 'backups', 'test.sqlite');
    const backup = new SqliteBackup(database.connection);

    await backup.create(destination);

    expect(existsSync(destination)).toBe(true);
    await expect(backup.create(destination)).rejects.toThrow('already exists');
  });

  it('revierte por completo una unidad de trabajo fallida', async () => {
    new MigrationRunner(database.connection).migrate();
    const unitOfWork = new SqliteUnitOfWork(database.session);

    await expect(
      unitOfWork.execute(async () => {
        await database.session.execute(async (connection) => {
          await connection
            .insertInto('companies')
            .values({
              created_at: '2026-07-12T12:00:00.000Z',
              currency_code: 'GTQ',
              display_name: 'Rollback',
              id: 'company-rollback',
              legal_name: 'Rollback',
              status: 'active',
              timezone: 'America/Guatemala',
            })
            .execute();
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    expect(database.connection.prepare('SELECT COUNT(*) AS total FROM companies').get()).toEqual({
      total: 0,
    });
  });
});
