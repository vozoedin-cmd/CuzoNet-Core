
import type { Database } from 'better-sqlite3';
import type { AlertPolicyRepository } from '../../application/ports/alerting/repositories.js';
import { AlertPolicy } from '../../domain/alerting/alert-policy.js';
import type { AlertSeverity, AlertCategory, AlertCondition } from '../../domain/alerting/types.js';

export class SqliteAlertPolicyRepository implements AlertPolicyRepository {
  constructor(private readonly db: Database) {}

  public async save(policy: AlertPolicy): Promise<void> {
    const p = policy.props;
    this.db.prepare(`
      INSERT INTO alert_policies (id, company_id, name, category, severity, condition_payload, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        severity = excluded.severity,
        condition_payload = excluded.condition_payload,
        is_active = excluded.is_active
    `).run(p.id, p.companyId, p.name, p.category, p.severity, JSON.stringify(p.condition), p.isActive ? 1 : 0);
  }

  public async findAllActive(companyId: string): Promise<AlertPolicy[]> {
    const rows = this.db.prepare(`
      SELECT * FROM alert_policies WHERE company_id = ? AND is_active = 1
    `).all(companyId) as Record<string, unknown>[];

    return rows.map(r => AlertPolicy.create({
      id: r.id as string,
      companyId: r.company_id as string,
      name: r.name as string,
      category: r.category as AlertCategory,
      severity: r.severity as AlertSeverity,
      condition: JSON.parse(r.condition_payload as string) as AlertCondition,
      isActive: r.is_active === 1
    }));
  }
}
