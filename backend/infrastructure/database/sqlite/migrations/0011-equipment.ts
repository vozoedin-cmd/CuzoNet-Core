import type { Migration } from '../migration/migration.js';

export const equipmentMigration: Migration = {
  name: 'equipment',
  version: 11,
  sql: `
    CREATE TABLE network_assets (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      asset_model_id TEXT,
      serial_number TEXT,
      mac_address TEXT,
      asset_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'retired')),
      acquired_on TEXT NOT NULL,
      role TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE UNIQUE INDEX network_assets_company_serial_unique
      ON network_assets(company_id, serial_number)
      WHERE serial_number IS NOT NULL;
    CREATE UNIQUE INDEX network_assets_company_mac_unique
      ON network_assets(company_id, mac_address)
      WHERE mac_address IS NOT NULL;

    CREATE TABLE asset_interfaces (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      interface_type TEXT,
      mac_address TEXT,
      capacity_kbps INTEGER,
      admin_state TEXT,
      oper_state TEXT,
      speed_mbps INTEGER,
      FOREIGN KEY (asset_id) REFERENCES network_assets(id) ON DELETE CASCADE
    );

    CREATE TABLE asset_assignments (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      service_id TEXT,
      node_id TEXT,
      assigned_from TEXT NOT NULL,
      assigned_to TEXT,
      role TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      released_by TEXT,
      FOREIGN KEY (asset_id) REFERENCES network_assets(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES client_services(id)
    );
  `,
};
