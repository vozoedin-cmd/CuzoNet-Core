import type { Migration } from '../migration/migration.js';

export const foundationMigration: Migration = {
  name: 'foundation',
  version: 1,
  sql: `
    CREATE TABLE database_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      database_version INTEGER NOT NULL CHECK (database_version >= 1),
      schema_version INTEGER NOT NULL CHECK (schema_version >= 0),
      updated_at TEXT NOT NULL
    );

    INSERT INTO database_metadata (id, database_version, schema_version, updated_at)
    VALUES (1, 1, 0, '1970-01-01T00:00:00.000Z');

    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE document_sequences (
      company_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      next_value INTEGER NOT NULL CHECK (next_value >= 1),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (company_id, document_type),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
  `,
};
