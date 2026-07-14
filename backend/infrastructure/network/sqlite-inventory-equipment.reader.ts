import type { Database } from 'better-sqlite3';
import type { InventoryEquipmentReader, InventoryEquipmentReference, InventoryEquipmentInterfaceReference } from '../../application/ports/network/inventory-equipment.reader.js';

export class SqliteInventoryEquipmentReader implements InventoryEquipmentReader {
  constructor(private readonly db: Database) {}

  public async findEquipmentById(id: string): Promise<InventoryEquipmentReference | null> {
    const row = this.db.prepare('SELECT id, company_id, status FROM network_assets WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      status: row.status as string
    };
  }

  public async findInterfaceById(id: string): Promise<InventoryEquipmentInterfaceReference | null> {
    const row = this.db.prepare('SELECT id, asset_id FROM asset_interfaces WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;
    return {
      id: row.id as string,
      equipmentId: row.asset_id as string
    };
  }
}
