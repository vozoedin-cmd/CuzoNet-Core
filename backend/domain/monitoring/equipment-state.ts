import type { Observation } from './observation.js';

export type AvailabilityStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'MAINTENANCE';

export interface EquipmentStateProps {
  equipmentId: string;
  status: AvailabilityStatus;
  lastSeenAt?: Date;
  lastLatencyMs?: number;
  uptimeSeconds?: number;
}

export class EquipmentState {
  private constructor(public readonly props: EquipmentStateProps) {}

  public static create(props: EquipmentStateProps): EquipmentState {
    return new EquipmentState({ ...props });
  }

  public applyObservations(observations: Observation[]): void {
    if (this.props.status === 'MAINTENANCE') {
      // Ignore automatic state transitions if in maintenance mode
      return;
    }

    let hasPing = false;
    let hasPacketLoss = false;
    let maxPacketLoss = 0;

    for (const obs of observations) {
      // Update last seen
      if (!this.props.lastSeenAt || obs.props.occurredAt > this.props.lastSeenAt) {
        this.props.lastSeenAt = obs.props.occurredAt;
      }

      if (obs.props.metricType === 'ping_latency' && obs.props.metricValue.unit === 'ms') {
        this.props.lastLatencyMs = obs.props.metricValue.value;
        hasPing = true;
      }

      if (obs.props.metricType === 'uptime' && obs.props.metricValue.unit === 'seconds') {
        this.props.uptimeSeconds = obs.props.metricValue.value;
      }

      if (obs.props.metricType === 'packet_loss' && obs.props.metricValue.unit === 'percent') {
        hasPacketLoss = true;
        if (obs.props.metricValue.value > maxPacketLoss) {
          maxPacketLoss = obs.props.metricValue.value;
        }
      }
    }

    if (hasPacketLoss && maxPacketLoss >= 100) {
      this.props.status = 'DOWN';
    } else if (hasPing && hasPacketLoss && maxPacketLoss > 20) {
      this.props.status = 'DEGRADED';
    } else if (hasPing) {
      this.props.status = 'UP';
    }
  }

  public markDown(): void {
    if (this.props.status !== 'MAINTENANCE') {
      this.props.status = 'DOWN';
    }
  }

  public setMaintenance(maintenance: boolean): void {
    if (maintenance) {
      this.props.status = 'MAINTENANCE';
    } else {
      this.props.status = 'UNKNOWN'; // Will be resolved on next observation
    }
  }
}
