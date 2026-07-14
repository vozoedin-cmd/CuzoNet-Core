import type { Migration } from '../migration/migration.js';

export const plansMigration: Migration = {
  name: 'plans',
  version: 10,
  sql: `
    CREATE TABLE plans (
      id TEXT PRIMARY KEY CHECK (length(id) = 36 AND substr(id, 15, 1) = '7'),
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      service_type TEXT NOT NULL CHECK (service_type IN ('simple_queue', 'pppoe', 'hotspot')),
      is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE (company_id, code),
      UNIQUE (company_id, id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE TABLE plan_versions (
      id TEXT PRIMARY KEY CHECK (length(id) = 36 AND substr(id, 15, 1) = '7'),
      plan_id TEXT NOT NULL,
      version_number INTEGER NOT NULL CHECK (version_number > 0),
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      upload_kbps INTEGER NOT NULL CHECK (upload_kbps > 0),
      download_kbps INTEGER NOT NULL CHECK (download_kbps > 0),
      burst_upload_kbps INTEGER CHECK (burst_upload_kbps > 0),
      burst_download_kbps INTEGER CHECK (burst_download_kbps > 0),
      priority INTEGER CHECK (priority > 0),
      effective_from TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (plan_id, version_number),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE INDEX plans_active_code_idx ON plans(company_id, is_active, code);
    CREATE INDEX plan_versions_plan_current_idx ON plan_versions(plan_id, version_number DESC);
  `,
};
