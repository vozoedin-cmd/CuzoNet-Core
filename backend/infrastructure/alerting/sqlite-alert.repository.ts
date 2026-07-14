
import type { Database } from 'better-sqlite3';
import type { AlertRepository } from '../../application/ports/alerting/repositories.js';
import { Alert, type AlertEventProps } from '../../domain/alerting/alert.js';
import type { AlertSeverity, AlertStatus, EntityType } from '../../domain/alerting/types.js';

export class SqliteAlertRepository implements AlertRepository {
  constructor(private readonly db: Database) {}

  public async save(alert: Alert): Promise<void> {
    const p = alert.props;
    
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO alerts (id, company_id, policy_id, entity_type, entity_id, status, severity, triggered_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          resolved_at = excluded.resolved_at
      `).run(
        p.id, p.companyId, p.policyId, p.entityType, p.entityId, p.status, p.severity, 
        p.triggeredAt.toISOString(), 
        p.resolvedAt ? p.resolvedAt.toISOString() : null
      );

      // Simple implementation: delete old history and insert all to avoid checking diffs
      this.db.prepare('DELETE FROM alert_history WHERE alert_id = ?').run(p.id);
      
      const insertHist = this.db.prepare(`
        INSERT INTO alert_history (id, alert_id, status, actor_id, occurred_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const h of p.history) {
        insertHist.run(h.id, p.id, h.status, h.actorId || null, h.occurredAt.toISOString());
      }
    })();
  }

  public async findById(id: string): Promise<Alert | null> {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;
    return this.mapToAlert(row);
  }

  public async findActiveAlerts(companyId: string): Promise<Alert[]> {
    const rows = this.db.prepare(`
      SELECT * FROM alerts 
      WHERE company_id = ? AND status != 'RESOLVED'
    `).all(companyId) as Record<string, unknown>[];
    
    const alerts: Alert[] = [];
    for (const row of rows) {
      alerts.push(await this.mapToAlert(row));
    }
    return alerts;
  }

  public async findByEntityAndPolicy(entityId: string, policyId: string, activeOnly: boolean): Promise<Alert | null> {
    let query = 'SELECT * FROM alerts WHERE entity_id = ? AND policy_id = ?';
    if (activeOnly) {
      query += " AND status != 'RESOLVED'";
    }
    query += " ORDER BY triggered_at DESC LIMIT 1";

    const row = this.db.prepare(query).get(entityId, policyId) as Record<string, unknown>;
    if (!row) return null;
    return this.mapToAlert(row);
  }

  private mapToAlert(row: Record<string, unknown>): Alert {
    const histRows = this.db.prepare('SELECT * FROM alert_history WHERE alert_id = ? ORDER BY occurred_at ASC').all(row.id as string) as Record<string, unknown>[];
    
    const history: AlertEventProps[] = histRows.map(h => ({
      id: h.id as string,
      status: h.status as AlertStatus,
      ...(h.actor_id ? { actorId: h.actor_id as string } : {}),
      occurredAt: new Date(h.occurred_at as string)
    }));

    return Alert.reconstitute({
      id: row.id as string,
      companyId: row.company_id as string,
      policyId: row.policy_id as string,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id as string,
      status: row.status as AlertStatus,
      severity: row.severity as AlertSeverity,
      triggeredAt: new Date(row.triggered_at as string),
      ...(row.resolved_at ? { resolvedAt: new Date(row.resolved_at as string) } : {}),
      history
    });
  }
}
