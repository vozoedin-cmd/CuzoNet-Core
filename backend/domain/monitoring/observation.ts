import { MetricValue, type MetricUnit } from './metric-value.js';

export interface ObservationProps {
  id: string;
  equipmentId: string;
  metricType: string;
  metricValue: MetricValue;
  occurredAt: Date;
  source: string;
}

export class Observation {
  private constructor(public readonly props: ObservationProps) {}

  public static create(props: Omit<ObservationProps, 'metricValue'> & { value: number; unit: MetricUnit }): Observation {
    const metricValue = MetricValue.create(props.value, props.unit);
    
    return new Observation({
      id: props.id,
      equipmentId: props.equipmentId,
      metricType: props.metricType,
      metricValue,
      occurredAt: props.occurredAt,
      source: props.source
    });
  }
}
