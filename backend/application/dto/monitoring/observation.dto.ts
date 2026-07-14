import type { MetricUnit } from '../../../domain/monitoring/metric-value.js';
import type { AvailabilityStatus } from '../../../domain/monitoring/equipment-state.js';

export interface ObservationDto {
  id: string;
  equipmentId: string;
  metricType: string;
  value: number;
  unit: MetricUnit;
  occurredAt: Date;
  source: string;
}

export interface EquipmentStateDto {
  equipmentId: string;
  status: AvailabilityStatus;
  lastSeenAt?: Date;
  lastLatencyMs?: number;
  uptimeSeconds?: number;
}

export interface TimeSeriesDataPointDto {
  timestamp: Date;
  value: number;
}

export interface TopologyStateSummaryDto {
  entityId: string;
  entityType: 'node' | 'link';
  overallStatus: AvailabilityStatus;
  equipmentStates: EquipmentStateDto[];
}
