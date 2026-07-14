import type { Database } from 'better-sqlite3';
import type { EquipmentStateRepository } from '../../application/ports/monitoring/equipment-state.repository.js';
import { EquipmentState, type AvailabilityStatus } from '../../domain/monitoring/equipment-state.js';

export class SqliteEquipmentStateRepository implements EquipmentStateRepository {
  constructor(private readonly db: Database) {}

  public async findById(equipmentId: string): Promise<EquipmentState | null> {
    const row = this.db.prepare('SELECT * FROM monitoring_current_states WHERE equipment_id = ?').get(equipmentId) as Record<string, unknown>;
    if (!row) return null;

    return EquipmentState.create({
      equipmentId: row.equipment_id as string,
      status: row.status as AvailabilityStatus,
      ...(row.last_seen_at ? { lastSeenAt: new Date(row.last_seen_at as string) } : {}),
      ...(row.last_latency_ms !== null ? { lastLatencyMs: row.last_latency_ms as number } : {}),
      ...(row.uptime_seconds !== null ? { uptimeSeconds: row.uptime_seconds as number } : {})
    });
  }

  public async save(state: EquipmentState): Promise<void> {
    const s = state.props;
    this.db.prepare(`
      INSERT INTO monitoring_current_states (equipment_id, status, last_seen_at, last_latency_ms, uptime_seconds)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(equipment_id) DO UPDATE SET
        status = excluded.status,
        last_seen_at = excluded.last_seen_at,
        last_latency_ms = excluded.last_latency_ms,
        uptime_seconds = excluded.uptime_seconds
    `).run(
      s.equipmentId,
      s.status,
      s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      s.lastLatencyMs !== undefined ? s.lastLatencyMs : null,
      s.uptimeSeconds !== undefined ? s.uptimeSeconds : null
    );
  }
}
