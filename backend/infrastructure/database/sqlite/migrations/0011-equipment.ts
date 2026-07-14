import type { Migration } from '../migration/migration.js';

export const equipmentMigration: Migration = {
  name: 'equipment',
  version: 11,
  sql: `
    ALTER TABLE network_assets ADD COLUMN role TEXT;
    ALTER TABLE network_assets ADD COLUMN capabilities TEXT;
    
    ALTER TABLE asset_interfaces ADD COLUMN admin_state TEXT;
    ALTER TABLE asset_interfaces ADD COLUMN oper_state TEXT;
    ALTER TABLE asset_interfaces ADD COLUMN speed_mbps INTEGER;
    
    ALTER TABLE asset_assignments ADD COLUMN assigned_by TEXT;
    ALTER TABLE asset_assignments ADD COLUMN released_by TEXT;
  `,
};
