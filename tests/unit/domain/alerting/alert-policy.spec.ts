
import { describe, it, expect } from 'vitest';
import { AlertPolicy } from '../../../../backend/domain/alerting/alert-policy.js';

describe('AlertPolicy', () => {
  it('should create a valid policy', () => {
    const policy = AlertPolicy.create({
      id: 'p1',
      companyId: 'c1',
      name: 'High Latency',
      category: 'NETWORK',
      severity: 'WARNING',
      condition: { metric: 'ping_latency', operator: '>', threshold: 100 },
      isActive: true
    });
    expect(policy.props.name).toBe('High Latency');
  });

  it('should reject policy without name', () => {
    expect(() => AlertPolicy.create({
      id: 'p1',
      companyId: 'c1',
      name: '  ',
      category: 'NETWORK',
      severity: 'WARNING',
      condition: { metric: 'ping_latency', operator: '>', threshold: 100 },
      isActive: true
    })).toThrow('AlertPolicy must have a name');
  });
});
