import { describe, expect, it } from 'vitest';

import { Observation } from '../../../../backend/domain/monitoring/observation.js';
import { SourcePriorityObservationPolicy } from '../../../../backend/infrastructure/monitoring/source-priority-observation.policy.js';

const occurredAt = new Date('2026-07-18T12:00:00Z');

describe('SourcePriorityObservationPolicy', () => {
  it('elige RouterOS sobre SNMP para la misma métrica sin depender del orden', () => {
    const policy = new SourcePriorityObservationPolicy();
    const snmpCpu = observation('cpu_usage', 10, 'snmp', 'percent');
    const routerOsCpu = observation('cpu_usage', 20, 'routeros-api', 'percent');

    expect(policy.select([snmpCpu, routerOsCpu])).toEqual([routerOsCpu]);
    expect(policy.select([routerOsCpu, snmpCpu])).toEqual([routerOsCpu]);
  });

  it('conserva métricas distintas y la señal ICMP', () => {
    const policy = new SourcePriorityObservationPolicy();
    const latency = observation('ping_latency', 5, 'icmp-ping', 'ms');
    const uptime = observation('uptime', 60, 'routeros-api', 'seconds');

    expect(policy.select([latency, uptime])).toEqual([latency, uptime]);
  });
});

function observation(
  metricType: string,
  value: number,
  source: string,
  unit: 'percent' | 'ms' | 'seconds',
): Observation {
  return Observation.create({
    equipmentId: 'router-1',
    id: `${source}-${metricType}`,
    metricType,
    occurredAt,
    source,
    unit,
    value,
  });
}
