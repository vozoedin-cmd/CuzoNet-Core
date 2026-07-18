import type { Database } from 'better-sqlite3';
import type {
  InventoryReader,
  InventoryEquipmentReference,
} from '../../application/ports/monitoring/inventory.reader.js';

export class SqliteInventoryReaderAdapter implements InventoryReader {
  constructor(private readonly db: Database) {}

  public async findEquipmentById(equipmentId: string): Promise<InventoryEquipmentReference | null> {
    const row = this.db
      .prepare(
        `
      SELECT id, company_id, asset_type, role, capabilities, status, management_host
      FROM network_assets
      WHERE id = ?
    `,
      )
      .get(equipmentId) as Record<string, unknown>;
    if (!row) return null;

    return this.toReference(row);
  }

  public async listEquipment(): Promise<InventoryEquipmentReference[]> {
    const rows = this.db
      .prepare(
        `
      SELECT id, company_id, asset_type, role, capabilities, status, management_host
      FROM network_assets
      ORDER BY company_id, id
    `,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.toReference(row));
  }

  private toReference(row: Record<string, unknown>): InventoryEquipmentReference {
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      type: row.asset_type as string,
      role: row.role as string,
      capabilities: JSON.parse(row.capabilities as string) as Record<string, unknown>,
      status: row.status as InventoryEquipmentReference['status'],
      ...(row.management_host === null ? {} : { managementHost: row.management_host as string }),
    };
  }
}
