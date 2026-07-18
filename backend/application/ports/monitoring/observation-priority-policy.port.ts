import type { Observation } from '../../../domain/monitoring/observation.js';

export interface ObservationPriorityPolicy {
  select(observations: readonly Observation[]): Observation[];
}
