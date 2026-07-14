import type { Database } from 'better-sqlite3';
import type { ResolvedRouterReference, ResolvedRouterReferenceReader } from '../../application/inventory/resolved-router-reference.js';

export class SqliteResolvedRouterReferenceReader implements ResolvedRouterReferenceReader {
  constructor(private readonly db: Database) {}

  public async findByRouterId(routerId: string): Promise<ResolvedRouterReference | null> {
    const row = this.db.prepare(`
      SELECT r.id as routerId, r.asset_id as equipmentId, a.asset_type as equipmentType, a.role as equipmentRole, n.name as locationReference
      FROM routers r
      JOIN network_assets a ON r.asset_id = a.id
      LEFT JOIN asset_assignments aa ON a.id = aa.asset_id AND aa.assigned_to IS NULL
      LEFT JOIN network_nodes n ON aa.node_id = n.id
      WHERE r.id = ?
    `).get(routerId) as Record<string, unknown>;

    if (!row) return null;
    return {
      equipmentId: row.equipmentId as string,
      routerId: row.routerId as string,
      equipmentType: row.equipmentType as string,
      equipmentRole: row.equipmentRole as string,
      locationReference: (row.locationReference as string) || 'Unknown'
    };
  }

  public async findByEquipmentId(equipmentId: string): Promise<ResolvedRouterReference | null> {
    const row = this.db.prepare(`
      SELECT r.id as routerId, r.asset_id as equipmentId, a.asset_type as equipmentType, a.role as equipmentRole, n.name as locationReference
      FROM routers r
      JOIN network_assets a ON r.asset_id = a.id
      LEFT JOIN asset_assignments aa ON a.id = aa.asset_id AND aa.assigned_to IS NULL
      LEFT JOIN network_nodes n ON aa.node_id = n.id
      WHERE a.id = ?
    `).get(equipmentId) as Record<string, unknown>;

    if (!row) return null;
    return {
      equipmentId: row.equipmentId as string,
      routerId: row.routerId as string,
      equipmentType: row.equipmentType as string,
      equipmentRole: row.equipmentRole as string,
      locationReference: (row.locationReference as string) || 'Unknown'
    };
  }
}
