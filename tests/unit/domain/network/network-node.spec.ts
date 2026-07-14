import { describe, it, expect } from 'vitest';
import { NetworkNode } from '../../../../backend/domain/network/network-node.js';
import { NetworkTower } from '../../../../backend/domain/network/network-tower.js';

describe('NetworkNode', () => {
  it('should create a valid network node', () => {
    const node = NetworkNode.create({
      id: 'n1',
      companyId: 'c1',
      code: 'NODE-01',
      name: 'Main Site',
      status: 'active',
      towers: []
    });
    
    expect(node.props.id).toBe('n1');
    expect(node.props.code).toBe('NODE-01');
  });

  it('should add a tower and a sector correctly', () => {
    const node = NetworkNode.create({
      id: 'n1',
      companyId: 'c1',
      code: 'NODE-01',
      name: 'Main Site',
      status: 'active',
      towers: []
    });

    node.addTower({
      id: 't1',
      code: 'T-01',
      name: 'Tower 1',
      heightMeters: 30,
      status: 'active',
      sectors: []
    });

    expect(node.props.towers.length).toBe(1);
    
    const tower = node.props.towers[0]!;
    tower.addSector({
      id: 's1',
      name: 'Sector North',
      azimuthDegrees: 0,
      status: 'active',
      equipmentId: 'eq1'
    });
    
    expect(tower.props.sectors.length).toBe(1);
    expect(tower.props.sectors[0]!.props.azimuthDegrees).toBe(0);
  });

  it('should reject invalid tower height', () => {
    expect(() => {
      NetworkTower.create({
        id: 't1',
        code: 'T-01',
        name: 'Tower 1',
        heightMeters: -10,
        status: 'active',
        sectors: []
      });
    }).toThrow('Tower height cannot be negative');
  });
});
