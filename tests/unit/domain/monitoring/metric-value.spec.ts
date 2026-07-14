import { describe, it, expect } from 'vitest';
import { MetricValue } from '../../../../backend/domain/monitoring/metric-value.js';

describe('MetricValue', () => {
  it('should create valid metric values', () => {
    const m1 = MetricValue.create(50, 'percent');
    expect(m1.value).toBe(50);
    expect(m1.unit).toBe('percent');

    const m2 = MetricValue.create(15, 'ms');
    expect(m2.value).toBe(15);
  });

  it('should reject invalid percent values', () => {
    expect(() => MetricValue.create(110, 'percent')).toThrow('Percent metric must be between 0 and 100');
    expect(() => MetricValue.create(-5, 'percent')).toThrow('Percent metric must be between 0 and 100');
  });

  it('should reject negative ms', () => {
    expect(() => MetricValue.create(-10, 'ms')).toThrow('Latency metric cannot be negative');
  });

  it('should reject invalid status values', () => {
    expect(() => MetricValue.create(2, 'status')).toThrow('Status metric must be 0 (down) or 1 (up)');
  });
});
