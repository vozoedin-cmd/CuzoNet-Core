import type { Migration } from '../migration/migration.js';

export const equipmentManagementHostMigration: Migration = {
  name: 'equipment-management-host',
  version: 16,
  sql: `
    ALTER TABLE network_assets
      ADD COLUMN management_host TEXT;
  `,
};
