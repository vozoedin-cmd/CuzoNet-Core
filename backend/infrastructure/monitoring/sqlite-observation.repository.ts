import type { Database } from 'better-sqlite3';
import type { ObservationRepository } from '../../application/ports/monitoring/observation.repository.js';
import { Observation } from '../../domain/monitoring/observation.js';
import type { MetricUnit } from '../../domain/monitoring/metric-value.js';

export class SqliteObservationRepository implements ObservationRepository {
  constructor(private readonly db: Database) {}

  public async saveBatch(observations: Observation[]): Promise<void> {
    if (observations.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO monitoring_observations (id, equipment_id, metric_type, value, unit, occurred_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((obsList: Observation[]) => {
      for (const obs of obsList) {
        const p = obs.props;
        stmt.run(p.id, p.equipmentId, p.metricType, p.metricValue.value, p.metricValue.unit, p.occurredAt.toISOString(), p.source);
      }
    });

    insertMany(observations);
  }

  public async findByEquipmentAndMetric(equipmentId: string, metricType: string, from: Date, to: Date): Promise<Observation[]> {
    const rows = this.db.prepare(`
      SELECT * FROM monitoring_observations 
      WHERE equipment_id = ? AND metric_type = ? AND occurred_at >= ? AND occurred_at <= ?
      ORDER BY occurred_at ASC
    `).all(equipmentId, metricType, from.toISOString(), to.toISOString()) as Record<string, unknown>[];

    return rows.map(r => Observation.create({
      id: r.id as string,
      equipmentId: r.equipment_id as string,
      metricType: r.metric_type as string,
      value: r.value as number,
      unit: r.unit as MetricUnit,
      occurredAt: new Date(r.occurred_at as string),
      source: r.source as string
    }));
  }
}
