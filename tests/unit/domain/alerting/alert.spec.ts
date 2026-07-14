
import { describe, it, expect } from 'vitest';
import { Alert } from '../../../../backend/domain/alerting/alert.js';

describe('Alert', () => {
  it('should create an alert in TRIGGERED state', () => {
    const alert = Alert.create({
      id: 'a1',
      companyId: 'c1',
      policyId: 'p1',
      entityType: 'equipment',
      entityId: 'eq1',
      severity: 'CRITICAL'
    });
    
    expect(alert.props.status).toBe('TRIGGERED');
    expect(alert.props.history).toHaveLength(1);
    expect(alert.props.history[0]?.status).toBe('TRIGGERED');
  });

  it('should acknowledge an alert', () => {
    const alert = Alert.create({
      id: 'a1', companyId: 'c1', policyId: 'p1', entityType: 'equipment', entityId: 'eq1', severity: 'CRITICAL'
    });
    
    alert.acknowledge('user1', 'evt1');
    expect(alert.props.status).toBe('ACKNOWLEDGED');
    expect(alert.props.history).toHaveLength(2);
  });

  it('should resolve an alert', () => {
    const alert = Alert.create({
      id: 'a1', companyId: 'c1', policyId: 'p1', entityType: 'equipment', entityId: 'eq1', severity: 'CRITICAL'
    });
    
    alert.resolve('user1', 'evt1');
    expect(alert.props.status).toBe('RESOLVED');
    expect(alert.props.resolvedAt).toBeDefined();
  });

  it('should not acknowledge a resolved alert', () => {
    const alert = Alert.create({
      id: 'a1', companyId: 'c1', policyId: 'p1', entityType: 'equipment', entityId: 'eq1', severity: 'CRITICAL'
    });
    alert.resolve('user1', 'evt1');
    
    expect(() => alert.acknowledge('user2', 'evt2')).toThrow('Cannot acknowledge a resolved alert');
  });
});
