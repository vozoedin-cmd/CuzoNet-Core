import type { Migration } from '../migration/migration.js';

/**
 * Admite `raw-rule` en el almacén declarativo de estado deseado.
 *
 * SQLite no permite alterar un CHECK: la única forma es reconstruir la tabla. El
 * procedimiento es el canónico —crear la nueva, copiar, soltar la vieja, renombrar y
 * recrear los índices— y es seguro porque el runner ejecuta cada migración dentro de una
 * transacción, así que un fallo a mitad deja la tabla original intacta.
 *
 * La copia es un `INSERT ... SELECT` columna por columna, no un `SELECT *`, para que un
 * cambio futuro de orden de columnas no la desalinee en silencio. Se preservan
 * identificadores, `revision`, los tres timestamps y el tombstone `deleted_at`: ninguna fila
 * existente se modifica.
 *
 * Los índices se vuelven a crear con el mismo nombre y la misma cláusula parcial que en la
 * 0023 —`WHERE deleted_at IS NULL`— porque `DROP TABLE` se lleva los suyos por delante.
 *
 * Este coste no lo pagaron Filter, NAT ni Mangle: los cinco tipos anteriores entraron en el
 * CHECK original de la 0023. Raw es el primer recurso que llega después.
 */
export const rawRuleDesiredStateMigration: Migration = {
  name: 'raw-rule-desired-state',
  version: 24,
  sql: `
    CREATE TABLE desired_resource_states_new (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      router_id TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (
        resource_type IN ('simple-queue', 'address-list-entry', 'filter-rule', 'nat-rule', 'mangle-rule', 'raw-rule')
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

    INSERT INTO desired_resource_states_new (
      id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
      disabled, desired_position, revision, created_at, updated_at, deleted_at
    )
    SELECT
      id, company_id, router_id, resource_type, resource_reference, desired_fields_json,
      disabled, desired_position, revision, created_at, updated_at, deleted_at
    FROM desired_resource_states;

    DROP TABLE desired_resource_states;

    ALTER TABLE desired_resource_states_new RENAME TO desired_resource_states;

    CREATE UNIQUE INDEX desired_resource_states_identity_uidx
      ON desired_resource_states(company_id, router_id, resource_type, resource_reference)
      WHERE deleted_at IS NULL;

    CREATE INDEX desired_resource_states_router_idx
      ON desired_resource_states(company_id, router_id, resource_type)
      WHERE deleted_at IS NULL;
  `,
};
