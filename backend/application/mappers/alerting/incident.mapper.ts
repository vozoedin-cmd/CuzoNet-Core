import type { Incident } from '../../../domain/alerting/incident.js';

export const IncidentMapper = {
  toDto(incident: Incident): Record<string, unknown> {
    const props = incident.props;
    return {
      ...props,
      acknowledgedAt: props.acknowledgedAt?.toISOString() ?? null,
      createdAt: props.createdAt.toISOString(),
      lastEvaluatedAt: props.lastEvaluatedAt.toISOString(),
      lastTriggeredAt: props.lastTriggeredAt.toISOString(),
      openedAt: props.openedAt.toISOString(),
      resolvedAt: props.resolvedAt?.toISOString() ?? null,
      updatedAt: props.updatedAt.toISOString(),
    };
  },
};
