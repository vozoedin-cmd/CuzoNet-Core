import type { Migration } from '../migration/migration.js';

export const mikrotikSimpleQueueMigration: Migration = {
  name: 'mikrotik-simple-queue',
  version: 9,
  sql: `
    CREATE TABLE mikrotik_resources (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      router_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('simple_queue')),
      remote_id TEXT,
      remote_name TEXT,
      desired_hash TEXT,
      observed_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'applied')),
      last_reconciled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, router_id, service_id, resource_type),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (company_id, service_id) REFERENCES client_services(company_id, id)
    );
    CREATE UNIQUE INDEX mikrotik_resources_remote_unique
      ON mikrotik_resources(company_id, router_id, resource_type, remote_id)
      WHERE remote_id IS NOT NULL;
    CREATE INDEX mikrotik_resources_reconciliation_idx
      ON mikrotik_resources(company_id, status, updated_at);
  `,
};
