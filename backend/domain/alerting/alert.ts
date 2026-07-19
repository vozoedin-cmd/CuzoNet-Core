/** @legacy Modelo Alert/AlertPolicy de la migración 0014; no usar en Incident Alerting. */

import type { AlertSeverity, AlertStatus, EntityType } from './types.js';

export interface AlertEventProps {
  id: string;
  status: AlertStatus;
  actorId?: string;
  occurredAt: Date;
}

export interface AlertProps {
  id: string;
  companyId: string;
  policyId: string;
  entityType: EntityType;
  entityId: string;
  status: AlertStatus;
  severity: AlertSeverity;
  triggeredAt: Date;
  resolvedAt?: Date;
  history: AlertEventProps[];
}

export class Alert {
  private constructor(public readonly props: AlertProps) {}

  public static create(props: Omit<AlertProps, 'history' | 'status' | 'triggeredAt'> & { id: string, triggeredAt?: Date }): Alert {
    const triggeredAt = props.triggeredAt || new Date();
    return new Alert({
      ...props,
      status: 'TRIGGERED',
      triggeredAt,
      history: [{
        id: `evt_${props.id}`, // Will be replaced by real ID in real usage, but for now we simplify
        status: 'TRIGGERED',
        occurredAt: triggeredAt
      }]
    });
  }

  public static reconstitute(props: AlertProps): Alert {
    return new Alert(props);
  }

  public acknowledge(actorId: string, eventId: string): void {
    if (this.props.status === 'RESOLVED') {
      throw new Error('Cannot acknowledge a resolved alert');
    }
    if (this.props.status === 'ACKNOWLEDGED') {
      return; // Idempotent
    }

    this.props.status = 'ACKNOWLEDGED';
    this.props.history.push({
      id: eventId,
      status: 'ACKNOWLEDGED',
      actorId,
      occurredAt: new Date()
    });
  }

  public resolve(actorId: string | undefined, eventId: string): void {
    if (this.props.status === 'RESOLVED') {
      return; // Idempotent
    }

    this.props.status = 'RESOLVED';
    this.props.resolvedAt = new Date();
    this.props.history.push({
      id: eventId,
      status: 'RESOLVED',
      ...(actorId ? { actorId } : {}),
      occurredAt: this.props.resolvedAt
    });
  }
}
