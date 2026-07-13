import type { Migration } from '../migration/migration.js';

export const servicesMigration: Migration = {
  name: 'services',
  version: 3,
  sql: `
    CREATE TABLE client_services (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      plan_version_id TEXT NOT NULL,
      service_type TEXT NOT NULL CHECK (service_type IN ('simple_queue', 'pppoe', 'hotspot')),
      lifecycle_status TEXT NOT NULL CHECK (
        lifecycle_status IN ('pending', 'active', 'suspended', 'cancelled', 'archived')
      ),
      billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 28),
      created_at TEXT NOT NULL,
      started_on TEXT,
      ended_on TEXT,
      UNIQUE (company_id, id),
      FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id)
    );
    CREATE INDEX client_services_client_idx
      ON client_services(company_id, client_id, created_at DESC, id);
    CREATE INDEX client_services_lifecycle_billing_idx
      ON client_services(company_id, lifecycle_status, billing_day);
  `,
};
