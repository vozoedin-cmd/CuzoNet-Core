import type { Database } from 'better-sqlite3';
import type { NetworkReader } from '../../application/ports/monitoring/network.reader.js';

export class SqliteNetworkReaderAdapter implements NetworkReader {
  constructor(private readonly db: Database) {}

  public async findEquipmentIdsByNode(nodeId: string): Promise<string[]> {
    // A node has towers, which have sectors, which have equipment
    const rows = this.db.prepare(`
      SELECT s.asset_id 
      FROM network_sectors s
      JOIN network_towers t ON s.tower_id = t.id
      WHERE t.node_id = ?
    `).all(nodeId) as { asset_id: string }[];
    return rows.map(r => r.asset_id);
  }

  public async findEquipmentIdsByLink(linkId: string): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT asset_id 
      FROM network_link_endpoints 
      WHERE link_id = ?
    `).all(linkId) as { asset_id: string }[];
    return rows.map(r => r.asset_id);
  }
}
