import type { ObservationPriorityPolicy } from '../../application/ports/monitoring/observation-priority-policy.port.js';
import type { Observation } from '../../domain/monitoring/observation.js';

const defaultSourcePriorities: Readonly<Record<string, number>> = Object.freeze({
  'icmp-ping': 300,
  'routeros-api': 200,
  snmp: 100,
});

export class SourcePriorityObservationPolicy implements ObservationPriorityPolicy {
  public constructor(
    private readonly priorities: Readonly<Record<string, number>> = defaultSourcePriorities,
  ) {}

  public select(observations: readonly Observation[]): Observation[] {
    const selected: Observation[] = [];
    const indexByMetric = new Map<string, number>();
    for (const observation of observations) {
      const key = `${observation.props.equipmentId}\u0000${observation.props.metricType}`;
      const existingIndex = indexByMetric.get(key);
      if (existingIndex === undefined) {
        indexByMetric.set(key, selected.length);
        selected.push(observation);
        continue;
      }

      const existing = selected[existingIndex];
      if (existing !== undefined && this.priority(observation) > this.priority(existing)) {
        selected[existingIndex] = observation;
      }
    }
    return selected;
  }

  private priority(observation: Observation): number {
    return this.priorities[observation.props.source] ?? 0;
  }
}
