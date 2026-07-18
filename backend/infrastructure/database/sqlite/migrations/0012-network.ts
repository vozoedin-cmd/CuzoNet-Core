import type { Migration } from '../migration/migration.js';

export const networkMigration: Migration = {
  name: 'network',
  version: 12,
  sql: `
    CREATE TABLE network_nodes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address_id TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL
    );
    CREATE INDEX network_nodes_company_idx ON network_nodes(company_id);

    CREATE TABLE network_towers (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      height_meters REAL NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES network_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE network_sectors (
      id TEXT PRIMARY KEY,
      tower_id TEXT NOT NULL,
      name TEXT NOT NULL,
      azimuth_degrees REAL NOT NULL,
      status TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_interface_id TEXT,
      FOREIGN KEY (tower_id) REFERENCES network_towers(id) ON DELETE CASCADE
    );

    CREATE TABLE network_links (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_kbps INTEGER,
      status TEXT NOT NULL
    );
    CREATE INDEX network_links_company_idx ON network_links(company_id);

    CREATE TABLE network_link_endpoints (
      id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL,
      side TEXT NOT NULL,
      node_id TEXT NOT NULL,
      asset_interface_id TEXT,
      asset_id TEXT NOT NULL,
      FOREIGN KEY (link_id) REFERENCES network_links(id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES network_nodes(id) ON DELETE CASCADE
    );
  `,
};
