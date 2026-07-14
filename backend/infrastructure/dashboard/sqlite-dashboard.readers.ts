
import type { Database } from 'better-sqlite3';
import type { 
  DashboardClientsReader, 
  DashboardBillingReader, 
  DashboardNetworkReader, 
  DashboardAlertingReader 
} from '../../application/ports/dashboard/readers.js';

export class SqliteDashboardReaders implements DashboardClientsReader, DashboardBillingReader, DashboardNetworkReader, DashboardAlertingReader {
  constructor(private readonly db: Database) {}

  public async getTotalActiveClients(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM clients WHERE company_id = ? AND status = 'ACTIVE'
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }

  public async getTotalActiveServices(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM services WHERE company_id = ? AND status = 'ACTIVE'
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }

  public async getMonthlyExpectedRevenueCents(companyId: string): Promise<number> {
    // Assuming plans price_cents * active services. Complex to join properly without full schema.
    // Simplification for BFF:
    const row = this.db.prepare(`
      SELECT SUM(p.price_cents) as total
      FROM services s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.company_id = ? AND s.status = 'ACTIVE'
    `).get(companyId) as { total: number | null };
    return row.total || 0;
  }

  public async getCollectedThisMonthCents(companyId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    
    const row = this.db.prepare(`
      SELECT SUM(amount_cents) as total
      FROM invoices
      WHERE company_id = ? AND status = 'PAID' AND created_at >= ?
    `).get(companyId, startOfMonth.toISOString()) as { total: number | null };
    return row.total || 0;
  }

  public async getOverdueThisMonthCents(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT SUM(amount_cents) as total
      FROM invoices
      WHERE company_id = ? AND status = 'OVERDUE'
    `).get(companyId) as { total: number | null };
    return row.total || 0;
  }

  public async getUnpaidInvoicesCount(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM invoices
      WHERE company_id = ? AND (status = 'ISSUED' OR status = 'OVERDUE')
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }

  public async getDownNetworkNodesCount(companyId: string): Promise<number> {
    // Requires joining network_nodes with monitoring_current_states
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM network_nodes n
      JOIN monitoring_current_states m ON n.equipment_id = m.equipment_id
      WHERE n.company_id = ? AND m.status = 'DOWN'
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }

  public async getTotalEquipments(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM network_assets WHERE company_id = ?
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }

  public async getEquipmentsByStatus(companyId: string, status: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM monitoring_current_states m
      JOIN network_assets a ON m.equipment_id = a.id
      WHERE a.company_id = ? AND m.status = ?
    `).get(companyId, status) as { cnt: number };
    return row.cnt;
  }

  public async getCriticalLinks(_companyId: string, _limit: number): Promise<Array<{ id: string; name: string; usagePercentage: number }>> {
    // Return empty array for now since we don't store usagePercentage directly in SQLite yet, just to satisfy BFF signature.
    return [];
  }

  public async getActiveCriticalAlertsCount(companyId: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM alerts
      WHERE company_id = ? AND status != 'RESOLVED' AND severity = 'CRITICAL'
    `).get(companyId) as { cnt: number };
    return row.cnt;
  }
}
