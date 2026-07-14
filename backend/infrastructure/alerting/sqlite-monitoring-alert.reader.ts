
import type { Database } from 'better-sqlite3';
import type { MonitoringAlertReader } from '../../application/ports/alerting/readers.js';

export class SqliteMonitoringAlertReader implements MonitoringAlertReader {
  constructor(private readonly db: Database) {}

  public async getDownEquipments(companyId: string): Promise<string[]> {
    // Requires joining with network_assets to ensure it belongs to the company
    const rows = this.db.prepare(`
      SELECT m.equipment_id 
      FROM monitoring_current_states m
      JOIN network_assets a ON m.equipment_id = a.id
      WHERE a.company_id = ? AND m.status = 'DOWN'
    `).all(companyId) as { equipment_id: string }[];
    
    return rows.map(r => r.equipment_id);
  }
}
