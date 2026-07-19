import type { Database } from 'better-sqlite3';

import type { IncidentEventRepository } from '../../application/ports/alerting/incident-repositories.js';
import { IncidentEvent } from '../../domain/alerting/incident-event.js';
import type { IncidentEventType } from '../../domain/alerting/incident-types.js';

interface IncidentEventRow {
  company_id: string;
  id: string;
  incident_id: string;
  occurred_at: string;
  payload_json: string;
  type: IncidentEventType;
}

export class SqliteIncidentEventRepository implements IncidentEventRepository {
  public constructor(private readonly database: Database) {}

  public async append(events: readonly IncidentEvent[]): Promise<void> {
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO incident_events (
        id, incident_id, company_id, type, occurred_at, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const event of events) {
      const occurredAt = event.props.occurredAt.toISOString();
      insert.run(
        event.props.id,
        event.props.incidentId,
        event.props.companyId,
        event.props.type,
        occurredAt,
        JSON.stringify(event.props.payload),
        occurredAt,
      );
    }
  }

  public listByIncident(companyId: string, incidentId: string): Promise<IncidentEvent[]> {
    const rows = this.database
      .prepare(
        `SELECT * FROM incident_events
         WHERE company_id = ? AND incident_id = ?
         ORDER BY occurred_at, id`,
      )
      .all(companyId, incidentId) as IncidentEventRow[];
    return Promise.resolve(
      rows.map((row) =>
        IncidentEvent.create({
          companyId: row.company_id,
          id: row.id,
          incidentId: row.incident_id,
          occurredAt: new Date(row.occurred_at),
          payload: JSON.parse(row.payload_json) as Record<string, unknown>,
          type: row.type,
        }),
      ),
    );
  }
}
