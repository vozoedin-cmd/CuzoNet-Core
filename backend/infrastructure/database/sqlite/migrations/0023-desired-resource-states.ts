import type { Migration } from '../migration/migration.js';

/**
 * The declarative desired-state store (Hito 21.5): the definitive source
 * of truth for each managed RouterOS resource's desired configuration,
 * superseding the Provisioning Engine's history as the input the
 * Synchronization Engine compares against real router state.
 *
 * The unique index is partial (`WHERE deleted_at IS NULL`) so a
 * soft-deleted resource's identity can be re-declared later without
 * colliding with its own tombstone.
 */
export const desiredResourceStatesMigration: Migration = {
  name: 'desired-resource-states',
  version: 23,
  sql: `
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
  `,
};
