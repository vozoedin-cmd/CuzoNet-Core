import type { Database } from 'better-sqlite3';
import type { NetworkNodeRepository } from '../../application/ports/network/network-node.repository.js';
import { NetworkNode } from '../../domain/network/network-node.js';
import { NetworkTower } from '../../domain/network/network-tower.js';
import { NetworkSector } from '../../domain/network/network-sector.js';

export class SqliteNetworkNodeRepository implements NetworkNodeRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<NetworkNode | null> {
    const row = this.db.prepare('SELECT * FROM network_nodes WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;

    const towers = this.db.prepare('SELECT * FROM network_towers WHERE node_id = ?').all(id) as Record<string, unknown>[];
    const towerInstances = towers.map(t => {
      const sectors = this.db.prepare('SELECT * FROM network_sectors WHERE tower_id = ?').all(t.id) as Record<string, unknown>[];
      const sectorInstances = sectors.map(s => NetworkSector.create({
        id: s.id as string,
        name: s.name as string,
        azimuthDegrees: s.azimuth_degrees as number,
        status: s.status as 'active' | 'inactive' | 'maintenance',
        equipmentId: s.asset_id as string,
        ...(s.asset_interface_id ? { equipmentInterfaceId: s.asset_interface_id as string } : {})
      }));

      return NetworkTower.create({
        id: t.id as string,
        code: t.code as string,
        name: t.name as string,
        heightMeters: t.height_meters as number,
        status: t.status as 'active' | 'inactive' | 'maintenance',
        sectors: sectorInstances
      });
    });

    return NetworkNode.create({
      id: row.id as string,
      companyId: row.company_id as string,
      code: row.code as string,
      name: row.name as string,
      status: row.status as 'active' | 'inactive' | 'maintenance',
      towers: towerInstances,
      ...(row.address_id ? { addressId: row.address_id as string } : {}),
      ...(row.latitude ? { latitude: row.latitude as number } : {}),
      ...(row.longitude ? { longitude: row.longitude as number } : {})
    });
  }

  public async listByCompanyId(companyId: string): Promise<NetworkNode[]> {
    const rows = this.db.prepare('SELECT id FROM network_nodes WHERE company_id = ?').all(companyId) as { id: string }[];
    const nodes = [];
    for (const r of rows) {
      const n = await this.findById(r.id);
      if (n) nodes.push(n);
    }
    return nodes;
  }

  public async save(node: NetworkNode): Promise<void> {
    const n = node.props;
    
    this.db.prepare(`
      INSERT INTO network_nodes (id, company_id, code, name, address_id, latitude, longitude, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        name = excluded.name,
        address_id = excluded.address_id,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        status = excluded.status
    `).run(
      n.id, n.companyId, n.code, n.name, n.addressId || null, n.latitude || null, n.longitude || null, n.status
    );

    // Simplification for saving towers and sectors
    for (const t of n.towers) {
      const tp = t.props;
      this.db.prepare(`
        INSERT INTO network_towers (id, node_id, code, name, height_meters, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          height_meters = excluded.height_meters,
          status = excluded.status
      `).run(tp.id, n.id, tp.code, tp.name, tp.heightMeters, tp.status);

      for (const s of tp.sectors) {
        const sp = s.props;
        this.db.prepare(`
          INSERT INTO network_sectors (id, tower_id, name, azimuth_degrees, status, asset_id, asset_interface_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            azimuth_degrees = excluded.azimuth_degrees,
            status = excluded.status,
            asset_id = excluded.asset_id,
            asset_interface_id = excluded.asset_interface_id
        `).run(sp.id, tp.id, sp.name, sp.azimuthDegrees, sp.status, sp.equipmentId, sp.equipmentInterfaceId || null);
      }
    }
  }
}
