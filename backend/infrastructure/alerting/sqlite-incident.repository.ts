import type { Database } from 'better-sqlite3';

import type {
  IncidentListFilters,
  IncidentRepository,
} from '../../application/ports/alerting/incident-repositories.js';
import type { AlertSeverity, IncidentStatus } from '../../domain/alerting/incident-types.js';
import { Incident } from '../../domain/alerting/incident.js';

interface IncidentRow {
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  company_id: string;
  correlation_key: string;
  created_at: string;
  duration_seconds: number | null;
  equipment_id: string;
  id: string;
  last_evaluated_at: string;
  last_triggered_at: string;
  opened_at: string;
  resolved_at: string | null;
  rule_id: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  title: string;
  updated_at: string;
}

export class SqliteIncidentRepository implements IncidentRepository {
  public constructor(private readonly database: Database) {}

  public async save(incident: Incident): Promise<void> {
    const props = incident.props;
    this.database
      .prepare(
        `INSERT INTO incidents (
          id, company_id, rule_id, equipment_id, status, severity, title, correlation_key,
          opened_at, acknowledged_at, acknowledged_by, resolved_at, last_evaluated_at,
          last_triggered_at, duration_seconds, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          severity = excluded.severity,
          title = excluded.title,
          acknowledged_at = excluded.acknowledged_at,
          acknowledged_by = excluded.acknowledged_by,
          resolved_at = excluded.resolved_at,
          last_evaluated_at = excluded.last_evaluated_at,
          last_triggered_at = excluded.last_triggered_at,
          duration_seconds = excluded.duration_seconds,
          updated_at = excluded.updated_at
        WHERE incidents.company_id = excluded.company_id`,
      )
      .run(
        props.id,
        props.companyId,
        props.ruleId,
        props.equipmentId,
        props.status,
        props.severity,
        props.title,
        props.correlationKey,
        props.openedAt.toISOString(),
        props.acknowledgedAt?.toISOString() ?? null,
        props.acknowledgedBy ?? null,
        props.resolvedAt?.toISOString() ?? null,
        props.lastEvaluatedAt.toISOString(),
        props.lastTriggeredAt.toISOString(),
        props.durationSeconds ?? null,
        props.createdAt.toISOString(),
        props.updatedAt.toISOString(),
      );
  }

  public findActiveByCorrelationKey(
    companyId: string,
    correlationKey: string,
  ): Promise<Incident | null> {
    const row = this.database
      .prepare(
        `SELECT * FROM incidents
         WHERE company_id = ? AND correlation_key = ?
           AND status IN ('open', 'acknowledged')
         ORDER BY opened_at DESC LIMIT 1`,
      )
      .get(companyId, correlationKey) as IncidentRow | undefined;
    return Promise.resolve(row === undefined ? null : mapIncident(row));
  }

  public findById(companyId: string, id: string): Promise<Incident | null> {
    const row = this.database
      .prepare('SELECT * FROM incidents WHERE company_id = ? AND id = ?')
      .get(companyId, id) as IncidentRow | undefined;
    return Promise.resolve(row === undefined ? null : mapIncident(row));
  }

  public list(companyId: string, filters: IncidentListFilters = {}): Promise<Incident[]> {
    const clauses = ['company_id = ?'];
    const parameters: Array<string> = [companyId];
    if (filters.status !== undefined) {
      clauses.push('status = ?');
      parameters.push(filters.status);
    }
    if (filters.severity !== undefined) {
      clauses.push('severity = ?');
      parameters.push(filters.severity);
    }
    if (filters.equipmentId !== undefined) {
      clauses.push('equipment_id = ?');
      parameters.push(filters.equipmentId);
    }
    if (filters.ruleId !== undefined) {
      clauses.push('rule_id = ?');
      parameters.push(filters.ruleId);
    }
    const rows = this.database
      .prepare(`SELECT * FROM incidents WHERE ${clauses.join(' AND ')} ORDER BY opened_at DESC, id`)
      .all(...parameters) as IncidentRow[];
    return Promise.resolve(rows.map(mapIncident));
  }
}

function mapIncident(row: IncidentRow): Incident {
  return Incident.reconstitute({
    companyId: row.company_id,
    correlationKey: row.correlation_key,
    createdAt: new Date(row.created_at),
    equipmentId: row.equipment_id,
    id: row.id,
    lastEvaluatedAt: new Date(row.last_evaluated_at),
    lastTriggeredAt: new Date(row.last_triggered_at),
    openedAt: new Date(row.opened_at),
    ruleId: row.rule_id,
    severity: row.severity,
    status: row.status,
    title: row.title,
    updatedAt: new Date(row.updated_at),
    ...(row.acknowledged_at === null ? {} : { acknowledgedAt: new Date(row.acknowledged_at) }),
    ...(row.acknowledged_by === null ? {} : { acknowledgedBy: row.acknowledged_by }),
    ...(row.duration_seconds === null ? {} : { durationSeconds: row.duration_seconds }),
    ...(row.resolved_at === null ? {} : { resolvedAt: new Date(row.resolved_at) }),
  });
}
