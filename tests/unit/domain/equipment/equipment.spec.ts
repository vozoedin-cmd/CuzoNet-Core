import { describe, it, expect } from 'vitest';
import { EquipmentRole } from '../../../../backend/domain/equipment/equipment-role.js';
import { EquipmentType } from '../../../../backend/domain/equipment/equipment-type.js';
import { EquipmentCapabilities } from '../../../../backend/domain/equipment/equipment-capabilities.js';
import { Equipment } from '../../../../backend/domain/equipment/equipment.js';
import { EquipmentAssignment } from '../../../../backend/domain/equipment/equipment-assignment.js';

describe('Equipment', () => {
  it('should create an equipment successfully', () => {
    const equipment = Equipment.create({
      id: 'eq-1',
      companyId: 'comp-1',
      type: EquipmentType.create('router'),
      role: EquipmentRole.create('cpe'),
      capabilities: EquipmentCapabilities.create({ supportsPppoe: true, supportsHotspot: false }),
      status: 'active',
      acquiredOn: new Date(),
      interfaces: [],
      assignments: []
    });

    expect(equipment.id).toBe('eq-1');
  });

  it('should manage assignments correctly', () => {
    const equipment = Equipment.create({
      id: 'eq-1',
      companyId: 'comp-1',
      type: EquipmentType.create('router'),
      role: EquipmentRole.create('cpe'),
      capabilities: EquipmentCapabilities.create({ supportsPppoe: true, supportsHotspot: false }),
      status: 'active',
      acquiredOn: new Date(),
      interfaces: [],
      assignments: []
    });

    const assignment = EquipmentAssignment.create({
      id: 'ass-1',
      assignedFrom: new Date(),
      role: 'main',
      assignedBy: 'user-1'
    });

    equipment.assign(assignment);
    expect(equipment.props.assignments).toHaveLength(1);

    expect(() => equipment.assign(assignment)).toThrow('Equipment already has an active assignment');
    
    assignment.release('user-2');
    expect(assignment.props.releasedBy).toBe('user-2');
  });
});
