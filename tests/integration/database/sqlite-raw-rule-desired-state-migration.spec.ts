import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';

/**
 * Migracion 0024: admitir `raw-rule` en el CHECK de `desired_resource_states.resource_type`.
 *
 * SQLite no permite alterar un CHECK, asi que la unica via es reconstruir la tabla — y una
 * reconstruccion es exactamente donde se pierden datos, indices o constraints sin que nadie
 * se entere. Estas pruebas parten de una base con el esquema ANTERIOR y filas dentro, aplican
 * la 0024 de verdad a traves del runner, y comprueban que lo unico que cambio fue el CHECK.
 */
describe('migration 0024: raw-rule in the desired-state store', () => {
  let database: SqliteDatabase;

  /** Esquema exacto de la 0023, para simular una base que nunca vio la 0024. */
  const SCHEMA_0023 = `
    CREATE TABLE desired_resource_states (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      router_id TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (
        resource_type IN ('simple-queue', 'address-list-entry', 'filter-rule', 'nat-rule', 'mangle-rule')
      ),
      resource_reference TEXT NOT NULL,
      desired_fields_json TEXT NOT NULL,
      disabled INTEGER NOT NULL CHECK (disabled IN (0, 1)),
      desired_position INTEGER,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX desired_resource_states_identity_uidx
      ON desired_resource_states(company_id, router_id, resource_type, resource_reference)
      WHERE deleted_at IS NULL;
    CREATE INDEX desired_resource_states_router_idx
      ON desired_resource_states(company_id, router_id, resource_type)
      WHERE deleted_at IS NULL;
  `;

  /** Una fila por tipo preexistente, mas un tombstone y una con posicion declarada. */
  const LEGACY_ROWS = [
    ['s-1', 'company-1', 'router-1', 'simple-queue', 'queue-1', '{"target":"192.168.1.10/32"}', 0, null, 1, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', null],
    ['s-2', 'company-1', 'router-1', 'address-list-entry', 'blocked:1.2.3.4', '{"comment":"moroso"}', 1, null, 4, '2026-02-01T00:00:00.000Z', '2026-02-05T00:00:00.000Z', null],
    ['s-3', 'company-1', 'router-1', 'filter-rule', 'block-ssh', '{"action":"drop","chain":"input"}', 0, 3, 7, '2026-03-01T00:00:00.000Z', '2026-03-09T00:00:00.000Z', null],
    ['s-4', 'company-2', 'router-9', 'nat-rule', 'forward-web', '{"action":"dst-nat"}', 0, 0, 2, '2026-04-01T00:00:00.000Z', '2026-04-02T00:00:00.000Z', null],
    ['s-5', 'company-1', 'router-1', 'mangle-rule', 'marca-voip', '{"passthrough":"true"}', 1, null, 11, '2026-05-01T00:00:00.000Z', '2026-05-03T00:00:00.000Z', null],
    // Tombstone: soft-deleted. La comparten identidad con s-3 salvo por `deleted_at`.
    ['s-6', 'company-1', 'router-1', 'filter-rule', 'block-ssh', '{"action":"accept"}', 0, null, 3, '2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z', '2026-06-03T00:00:00.000Z'],
  ] as const;

  const insertLegacyRows = (): void => {
    const statement = database.connection.prepare(
      `INSERT INTO desired_resource_states (
         id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
         disabled, desired_position, revision, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of LEGACY_ROWS) statement.run(...row);
  };

  const snapshot = (): unknown[] =>
    database.connection.prepare('SELECT * FROM desired_resource_states ORDER BY id').all();

  const indexNames = (): string[] =>
    (
      database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'desired_resource_states'")
        .all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter((name) => !name.startsWith('sqlite_'))
      .sort();

  const insert = (id: string, resourceType: string, reference = `ref-${id}`): void => {
    database.connection
      .prepare(
        `INSERT INTO desired_resource_states (
           id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
           disabled, desired_position, revision, created_at, updated_at, deleted_at
         ) VALUES (?, 'company-1', 'router-1', ?, ?, '{}', 0, NULL, 1, 'now', 'now', NULL)`,
      )
      .run(id, resourceType, reference);
  };

  /** Deja la base exactamente como estaba antes de la 0024, con datos historicos dentro. */
  function rollBackTo0023(): void {
    database.connection.exec('DROP TABLE desired_resource_states');
    database.connection.exec(SCHEMA_0023);
    database.connection.prepare('DELETE FROM schema_migrations WHERE version = 24').run();
    insertLegacyRows();
  }

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    rollBackTo0023();
  });

  afterEach(async () => {
    await database.close();
  });

  it('starts from a schema that rejects raw-rule', () => {
    expect(new MigrationRunner(database.connection).currentVersion()).to.equal(23);
    expect(() => insert('pre-raw', 'raw-rule')).toThrow(/CHECK constraint failed/);
  });

  it('accepts raw-rule once 0024 is applied', () => {
    new MigrationRunner(database.connection).migrate();

    expect(new MigrationRunner(database.connection).currentVersion()).to.equal(24);
    expect(() => insert('post-raw', 'raw-rule')).not.toThrow();
  });

  it('keeps accepting every previously valid resource type', () => {
    new MigrationRunner(database.connection).migrate();

    for (const resourceType of ['simple-queue', 'address-list-entry', 'filter-rule', 'nat-rule', 'mangle-rule']) {
      expect(() => insert(`new-${resourceType}`, resourceType), resourceType).not.toThrow();
    }
  });

  it('still rejects an unknown resource type', () => {
    new MigrationRunner(database.connection).migrate();

    for (const invalid of ['raw', 'firewall-raw', 'ipv6-raw', '']) {
      expect(() => insert(`bad-${invalid}`, invalid), invalid).toThrow(/CHECK constraint failed/);
    }
  });

  it('preserves every historical row byte for byte', () => {
    const before = snapshot();

    new MigrationRunner(database.connection).migrate();

    expect(snapshot()).to.deep.equal(before);
    expect(snapshot()).to.have.length(LEGACY_ROWS.length);
  });

  it('preserves timestamps, revisions, positions and tombstones', () => {
    new MigrationRunner(database.connection).migrate();

    const rows = snapshot() as Record<string, unknown>[];
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get('s-3')).to.include({
      created_at: '2026-03-01T00:00:00.000Z',
      desired_position: 3,
      revision: 7,
      updated_at: '2026-03-09T00:00:00.000Z',
    });
    expect(byId.get('s-5')).to.include({ disabled: 1, revision: 11 });
    expect(byId.get('s-6')?.deleted_at).to.equal('2026-06-03T00:00:00.000Z');
    // El JSON del estado deseado viaja opaco: la migracion no lo reinterpreta.
    expect(byId.get('s-5')?.desired_fields_json).to.equal('{"passthrough":"true"}');
  });

  it('preserves both indexes, with the same names', () => {
    const before = indexNames();
    expect(before).to.deep.equal(['desired_resource_states_identity_uidx', 'desired_resource_states_router_idx']);

    new MigrationRunner(database.connection).migrate();

    expect(indexNames()).to.deep.equal(before);
  });

  /** El indice unico es PARCIAL: un tombstone no debe bloquear una redeclaracion. */
  it('preserves the partial unique index, tombstones included', () => {
    new MigrationRunner(database.connection).migrate();

    // Identidad ya viva en s-3: debe chocar.
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO desired_resource_states (
             id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
             disabled, desired_position, revision, created_at, updated_at, deleted_at
           ) VALUES ('dup', 'company-1', 'router-1', 'filter-rule', 'block-ssh', '{}', 0, NULL, 1, 'now', 'now', NULL)`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    // La misma identidad que el tombstone s-6 pero para raw-rule: no choca.
    expect(() => insert('raw-libre', 'raw-rule', 'block-ssh')).not.toThrow();
  });

  it('preserves the disabled and revision CHECKs', () => {
    new MigrationRunner(database.connection).migrate();

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO desired_resource_states (
             id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
             disabled, desired_position, revision, created_at, updated_at, deleted_at
           ) VALUES ('bad-disabled', 'company-1', 'router-1', 'raw-rule', 'r', '{}', 2, NULL, 1, 'now', 'now', NULL)`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO desired_resource_states (
             id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
             disabled, desired_position, revision, created_at, updated_at, deleted_at
           ) VALUES ('bad-revision', 'company-1', 'router-1', 'raw-rule', 'r2', '{}', 0, NULL, 0, 'now', 'now', NULL)`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('leaves no rebuild leftovers behind', () => {
    new MigrationRunner(database.connection).migrate();

    const tables = (
      database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'desired_resource_states%'")
        .all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).to.deep.equal(['desired_resource_states']);
  });

  it('is idempotent: re-running the runner changes nothing', () => {
    new MigrationRunner(database.connection).migrate();
    const after = snapshot();

    new MigrationRunner(database.connection).migrate();

    expect(snapshot()).to.deep.equal(after);
    expect(new MigrationRunner(database.connection).currentVersion()).to.equal(24);
  });
});
