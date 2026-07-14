import type { Database } from 'better-sqlite3';
import type { InventoryReader, InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';

export class SqliteInventoryReaderAdapter implements InventoryReader {
  constructor(private readonly db: Database) {}

  public async findEquipmentById(equipmentId: string): Promise<InventoryEquipmentReference | null> {
    const row = this.db.prepare('SELECT id, company_id FROM network_assets WHERE id = ?').get(equipmentId) as Record<string, unknown>;
    if (!row) return null;

    return {
      id: row.id as string,
      companyId: row.company_id as string
    };
  }
}
