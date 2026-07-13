import type { Migration } from '../migration/migration.js';

export const clientsMigration: Migration = {
  name: 'clients',
  version: 2,
  sql: `
    CREATE TABLE clients (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      client_type TEXT NOT NULL CHECK (client_type IN ('person', 'company')),
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      document_key TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT,
      archived_at TEXT,
      UNIQUE (company_id, id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE UNIQUE INDEX clients_active_document_unique
      ON clients(company_id, document_key)
      WHERE status = 'active';
    CREATE INDEX clients_company_created_idx ON clients(company_id, created_at DESC, id);
    CREATE INDEX clients_company_status_idx ON clients(company_id, status);

    CREATE TABLE client_contacts (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'email', 'whatsapp')),
      value_normalized TEXT NOT NULL,
      value_display TEXT NOT NULL,
      is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
      verified_at TEXT,
      position INTEGER NOT NULL CHECK (position >= 0),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE (client_id, position)
    );
    CREATE INDEX client_contacts_normalized_idx ON client_contacts(value_normalized);
    CREATE UNIQUE INDEX client_contacts_primary_unique
      ON client_contacts(client_id, contact_type)
      WHERE is_primary = 1;

    CREATE TABLE client_addresses (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      label TEXT,
      address_line TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      is_service_address INTEGER NOT NULL CHECK (is_service_address IN (0, 1)),
      position INTEGER NOT NULL CHECK (position >= 0),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE (client_id, position)
    );

    CREATE TABLE client_notes (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      body TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position >= 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE (client_id, position)
    );
  `,
};
