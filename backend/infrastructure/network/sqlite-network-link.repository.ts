import type { Database } from 'better-sqlite3';
import type { NetworkLinkRepository } from '../../application/ports/network/network-link.repository.js';
import { NetworkLink, type LinkType } from '../../domain/network/network-link.js';
import { NetworkLinkEndpoint } from '../../domain/network/network-link-endpoint.js';

export class SqliteNetworkLinkRepository implements NetworkLinkRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<NetworkLink | null> {
    const row = this.db.prepare('SELECT * FROM network_links WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;

    const endpointRows = this.db.prepare('SELECT * FROM network_link_endpoints WHERE link_id = ?').all(id) as Record<string, unknown>[];
    const endpoints = endpointRows.map(e => NetworkLinkEndpoint.create({
      id: e.id as string,
      side: e.side as 'A' | 'B',
      nodeId: e.node_id as string,
      equipmentId: e.asset_id as string,
      ...(e.asset_interface_id ? { equipmentInterfaceId: e.asset_interface_id as string } : {})
    }));

    return NetworkLink.create({
      id: row.id as string,
      companyId: row.company_id as string,
      linkType: row.link_type as LinkType,
      name: row.name as string,
      status: row.status as 'active' | 'inactive' | 'maintenance',
      endpoints,
      ...(row.capacity_kbps ? { capacityKbps: row.capacity_kbps as number } : {})
    });
  }

  public async listByCompanyId(companyId: string): Promise<NetworkLink[]> {
    const rows = this.db.prepare('SELECT id FROM network_links WHERE company_id = ?').all(companyId) as { id: string }[];
    const links = [];
    for (const r of rows) {
      const l = await this.findById(r.id);
      if (l) links.push(l);
    }
    return links;
  }

  public async save(link: NetworkLink): Promise<void> {
    const l = link.props;
    
    this.db.prepare(`
      INSERT INTO network_links (id, company_id, link_type, name, capacity_kbps, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        link_type = excluded.link_type,
        name = excluded.name,
        capacity_kbps = excluded.capacity_kbps,
        status = excluded.status
    `).run(l.id, l.companyId, l.linkType, l.name, l.capacityKbps || null, l.status);

    for (const ep of l.endpoints) {
      const e = ep.props;
      this.db.prepare(`
        INSERT INTO network_link_endpoints (id, link_id, side, node_id, asset_interface_id, asset_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          side = excluded.side,
          node_id = excluded.node_id,
          asset_interface_id = excluded.asset_interface_id,
          asset_id = excluded.asset_id
      `).run(e.id, l.id, e.side, e.nodeId, e.equipmentInterfaceId || null, e.equipmentId);
    }
  }
}
