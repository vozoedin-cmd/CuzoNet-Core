import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS network_nodes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address_id TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_network_nodes_company ON network_nodes(company_id);

    CREATE TABLE IF NOT EXISTS network_towers (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      height_meters REAL NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES network_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS network_sectors (
      id TEXT PRIMARY KEY,
      tower_id TEXT NOT NULL,
      name TEXT NOT NULL,
      azimuth_degrees REAL NOT NULL,
      status TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_interface_id TEXT,
      FOREIGN KEY (tower_id) REFERENCES network_towers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS network_links (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_kbps INTEGER,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_network_links_company ON network_links(company_id);

    CREATE TABLE IF NOT EXISTS network_link_endpoints (
      id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL,
      side TEXT NOT NULL,
      node_id TEXT NOT NULL,
      asset_interface_id TEXT,
      asset_id TEXT NOT NULL,
      FOREIGN KEY (link_id) REFERENCES network_links(id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES network_nodes(id) ON DELETE CASCADE
    );
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS network_link_endpoints;
    DROP TABLE IF EXISTS network_links;
    DROP TABLE IF EXISTS network_sectors;
    DROP TABLE IF EXISTS network_towers;
    DROP TABLE IF EXISTS network_nodes;
  `);
}
