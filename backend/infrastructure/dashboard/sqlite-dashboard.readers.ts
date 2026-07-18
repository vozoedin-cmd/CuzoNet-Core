import type { Database } from 'better-sqlite3';

import type {
  DashboardAlertingReader,
  DashboardBillingReader,
  DashboardClientsReader,
  DashboardNetworkReader,
} from '../../application/ports/dashboard/readers.js';

interface DashboardClock {
  now(): Date;
}

interface CountRow {
  count: number;
}

interface TotalRow {
  total: number;
}

export class SqliteDashboardReaders
  implements
    DashboardClientsReader,
    DashboardBillingReader,
    DashboardNetworkReader,
    DashboardAlertingReader
{
  public constructor(
    private readonly database: Database,
    private readonly clock: DashboardClock = { now: () => new Date() },
  ) {}

  public async getTotalActiveClients(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM clients WHERE company_id = ? AND status = 'active'",
      )
      .get(companyId) as CountRow;
    return row.count;
  }

  public async getTotalActiveServices(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM client_services WHERE company_id = ? AND lifecycle_status = 'active'",
      )
      .get(companyId) as CountRow;
    return row.count;
  }

  public async getMonthlyExpectedRevenueCents(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          SELECT COALESCE(SUM(version.price_cents), 0) AS total
          FROM client_services AS service
          INNER JOIN plan_versions AS version ON version.id = service.plan_version_id
          WHERE service.company_id = ? AND service.lifecycle_status = 'active'
        `,
      )
      .get(companyId) as TotalRow;
    return row.total;
  }

  public async getCollectedThisMonthCents(companyId: string): Promise<number> {
    const now = this.clock.now();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const row = this.database
      .prepare(
        `
          SELECT COALESCE(SUM(amount_cents), 0) AS total
          FROM payments
          WHERE company_id = ? AND status = 'recorded' AND received_at >= ?
        `,
      )
      .get(companyId, monthStart) as TotalRow;
    return row.total;
  }

  public async getOverdueThisMonthCents(companyId: string): Promise<number> {
    const today = this.clock.now().toISOString().slice(0, 10);
    const row = this.database
      .prepare(
        `
          WITH allocated AS (
            SELECT allocation.invoice_id, SUM(allocation.amount_cents) AS allocated_cents
            FROM payment_allocations AS allocation
            INNER JOIN payments AS payment ON payment.id = allocation.payment_id
            WHERE payment.company_id = ? AND payment.status = 'recorded'
            GROUP BY allocation.invoice_id
          ),
          outstanding AS (
            SELECT MAX(invoice.total_cents - COALESCE(allocated.allocated_cents, 0), 0) AS amount_cents
            FROM invoices AS invoice
            LEFT JOIN allocated ON allocated.invoice_id = invoice.id
            WHERE invoice.company_id = ?
              AND invoice.document_status = 'issued'
              AND invoice.due_on < ?
          )
          SELECT COALESCE(SUM(amount_cents), 0) AS total FROM outstanding
        `,
      )
      .get(companyId, companyId, today) as TotalRow;
    return row.total;
  }

  public async getUnpaidInvoicesCount(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          WITH allocated AS (
            SELECT allocation.invoice_id, SUM(allocation.amount_cents) AS allocated_cents
            FROM payment_allocations AS allocation
            INNER JOIN payments AS payment ON payment.id = allocation.payment_id
            WHERE payment.company_id = ? AND payment.status = 'recorded'
            GROUP BY allocation.invoice_id
          )
          SELECT COUNT(*) AS count
          FROM invoices AS invoice
          LEFT JOIN allocated ON allocated.invoice_id = invoice.id
          WHERE invoice.company_id = ?
            AND invoice.document_status = 'issued'
            AND invoice.total_cents - COALESCE(allocated.allocated_cents, 0) > 0
        `,
      )
      .get(companyId, companyId) as CountRow;
    return row.count;
  }

  public async getDownNetworkNodesCount(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          WITH node_equipment AS (
            SELECT endpoint.node_id, endpoint.asset_id AS equipment_id
            FROM network_link_endpoints AS endpoint
            UNION
            SELECT tower.node_id, sector.asset_id AS equipment_id
            FROM network_sectors AS sector
            INNER JOIN network_towers AS tower ON tower.id = sector.tower_id
          )
          SELECT COUNT(DISTINCT node.id) AS count
          FROM network_nodes AS node
          INNER JOIN node_equipment ON node_equipment.node_id = node.id
          INNER JOIN monitoring_current_states AS state
            ON state.equipment_id = node_equipment.equipment_id
          WHERE node.company_id = ? AND state.status = 'DOWN'
        `,
      )
      .get(companyId) as CountRow;
    return row.count;
  }

  public async getTotalEquipments(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          WITH company_equipment AS (
            SELECT endpoint.asset_id AS equipment_id
            FROM network_link_endpoints AS endpoint
            INNER JOIN network_nodes AS node ON node.id = endpoint.node_id
            WHERE node.company_id = ?
            UNION
            SELECT sector.asset_id AS equipment_id
            FROM network_sectors AS sector
            INNER JOIN network_towers AS tower ON tower.id = sector.tower_id
            INNER JOIN network_nodes AS node ON node.id = tower.node_id
            WHERE node.company_id = ?
          )
          SELECT COUNT(*) AS count FROM company_equipment
        `,
      )
      .get(companyId, companyId) as CountRow;
    return row.count;
  }

  public async getEquipmentsByStatus(companyId: string, status: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          WITH company_equipment AS (
            SELECT endpoint.asset_id AS equipment_id
            FROM network_link_endpoints AS endpoint
            INNER JOIN network_nodes AS node ON node.id = endpoint.node_id
            WHERE node.company_id = ?
            UNION
            SELECT sector.asset_id AS equipment_id
            FROM network_sectors AS sector
            INNER JOIN network_towers AS tower ON tower.id = sector.tower_id
            INNER JOIN network_nodes AS node ON node.id = tower.node_id
            WHERE node.company_id = ?
          )
          SELECT COUNT(*) AS count
          FROM company_equipment
          INNER JOIN monitoring_current_states AS state
            ON state.equipment_id = company_equipment.equipment_id
          WHERE state.status = ?
        `,
      )
      .get(companyId, companyId, status) as CountRow;
    return row.count;
  }

  public async getCriticalLinks(
    _companyId: string,
    _limit: number,
  ): Promise<Array<{ id: string; name: string; usagePercentage: number }>> {
    return [];
  }

  public async getActiveCriticalAlertsCount(companyId: string): Promise<number> {
    const row = this.database
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM alerts
          WHERE company_id = ? AND status != 'RESOLVED' AND severity = 'CRITICAL'
        `,
      )
      .get(companyId) as CountRow;
    return row.count;
  }
}
