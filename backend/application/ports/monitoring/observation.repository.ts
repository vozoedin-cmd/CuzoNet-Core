import type { Observation } from '../../../domain/monitoring/observation.js';

export interface ObservationRepository {
  saveBatch(observations: Observation[]): Promise<void>;
  findByEquipmentAndMetric(equipmentId: string, metricType: string, from: Date, to: Date): Promise<Observation[]>;
}
