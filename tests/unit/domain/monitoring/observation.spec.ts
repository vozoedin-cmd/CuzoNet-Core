import { describe, it, expect } from 'vitest';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';

describe('Observation', () => {
  it('should create a valid observation', () => {
    const obs = Observation.create({
      id: 'o1',
      equipmentId: 'eq1',
      metricType: 'ping_latency',
      value: 20,
      unit: 'ms',
      occurredAt: new Date(),
      source: 'ping-poller'
    });

    expect(obs.props.metricValue.value).toBe(20);
    expect(obs.props.metricValue.unit).toBe('ms');
  });
});
