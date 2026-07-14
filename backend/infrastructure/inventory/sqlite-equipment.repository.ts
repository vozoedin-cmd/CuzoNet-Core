import type { Database } from 'better-sqlite3';
import type { EquipmentRepository } from '../../domain/inventory/equipment.repository.js';
import { Equipment } from '../../domain/inventory/equipment.js';
import { EquipmentRole } from '../../domain/inventory/equipment-role.js';
import { EquipmentType } from '../../domain/inventory/equipment-type.js';
import { EquipmentCapabilities } from '../../domain/inventory/equipment-capabilities.js';
import { EquipmentInterface } from '../../domain/inventory/equipment-interface.js';
import { EquipmentAssignment } from '../../domain/inventory/equipment-assignment.js';

export class SqliteEquipmentRepository implements EquipmentRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<Equipment | null> {
    const row = this.db.prepare('SELECT * FROM network_assets WHERE id = ?').get(id) as Record<string, unknown>;
    if (!row) return null;

    const interfaces = this.db.prepare('SELECT * FROM asset_interfaces WHERE asset_id = ?').all(id) as Record<string, unknown>[];
    const assignments = this.db.prepare('SELECT * FROM asset_assignments WHERE asset_id = ?').all(id) as Record<string, unknown>[];

    return Equipment.create({
      id: row.id as string,
      companyId: row.company_id as string,
      type: EquipmentType.create(row.asset_type as string),
      role: EquipmentRole.create((row.role as string) || 'unknown'),
      capabilities: EquipmentCapabilities.create(row.capabilities ? JSON.parse(row.capabilities as string) : {}),
      status: row.status as 'active' | 'inactive' | 'retired',
      acquiredOn: new Date(row.acquired_on as string),
      interfaces: interfaces.map(i => EquipmentInterface.create({
        id: i.id as string,
        name: i.name as string,
        ...(i.mac_address ? { macAddress: i.mac_address as string } : {}),
        ...(i.capacity_kbps ? { capacityKbps: i.capacity_kbps as number } : {}),
        ...(i.admin_state ? { adminState: i.admin_state as 'up' | 'down' } : {}),
        ...(i.oper_state ? { operState: i.oper_state as 'up' | 'down' | 'unknown' } : {}),
        ...(i.speed_mbps ? { speedMbps: i.speed_mbps as number } : {})
      })),
      assignments: assignments.map(a => EquipmentAssignment.create({
        id: a.id as string,
        assignedFrom: new Date(a.assigned_from as string),
        role: a.role as string,
        assignedBy: a.assigned_by as string,
        ...(a.service_id ? { serviceId: a.service_id as string } : {}),
        ...(a.node_id ? { nodeId: a.node_id as string } : {}),
        ...(a.assigned_to ? { assignedTo: new Date(a.assigned_to as string) } : {}),
        ...(a.released_by ? { releasedBy: a.released_by as string } : {})
      })),
      ...(row.asset_model_id ? { assetModelId: row.asset_model_id as string } : {}),
      ...(row.serial_number ? { serialNumber: row.serial_number as string } : {}),
      ...(row.mac_address ? { macAddress: row.mac_address as string } : {})
    });
  }

  public async save(equipment: Equipment): Promise<void> {
    const e = equipment.props;
    
    this.db.prepare(`
      INSERT INTO network_assets (id, company_id, asset_model_id, serial_number, mac_address, asset_type, status, acquired_on, role, capabilities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        serial_number = excluded.serial_number,
        mac_address = excluded.mac_address,
        status = excluded.status,
        role = excluded.role,
        capabilities = excluded.capabilities
    `).run(
      e.id,
      e.companyId,
      e.assetModelId || null,
      e.serialNumber || null,
      e.macAddress || null,
      e.type.value,
      e.status,
      e.acquiredOn.toISOString(),
      e.role.value,
      JSON.stringify(e.capabilities.props)
    );

    // Simplification for assigning interfaces and assignments would go here
    // e.g. iterate and upsert asset_interfaces and asset_assignments
  }
}
