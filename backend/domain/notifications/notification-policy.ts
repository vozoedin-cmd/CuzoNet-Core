import type { NotificationDestination } from './notification-destination.js';
import type { NotificationTemplateCode } from './notification-template.js';
import type {
  IncidentNotificationEvent,
  NotificationEventType,
  NotificationPriority,
} from './types.js';

export interface NotificationCommand {
  destination: NotificationDestination;
  eventType: NotificationEventType;
  priority: NotificationPriority;
  templateCode: NotificationTemplateCode;
}

const severityRank = Object.freeze({ critical: 5, info: 1, major: 4, minor: 2, warning: 3 });

export class NotificationPolicy {
  public select(
    event: IncidentNotificationEvent,
    destinations: readonly NotificationDestination[],
  ): readonly NotificationCommand[] {
    const eventType = mapEventType(event.eventType);
    const templateCode = mapTemplateCode(eventType);
    const priority = priorityFor(event);
    return destinations
      .filter((destination) => destination.props.companyId === event.companyId)
      .filter((destination) => destination.props.enabled)
      .filter((destination) => destination.props.eventTypes.includes(eventType))
      .filter((destination) => {
        const minimum = destination.props.minimumSeverity;
        return minimum === undefined || severityRank[event.severity] >= severityRank[minimum];
      })
      .map((destination) => ({ destination, eventType, priority, templateCode }));
  }
}

export function mapEventType(
  eventType: IncidentNotificationEvent['eventType'],
): NotificationEventType {
  if (eventType === 'IncidentOpened.v1') return 'incident_opened';
  if (eventType === 'IncidentAcknowledged.v1') return 'incident_acknowledged';
  return 'incident_resolved';
}

function mapTemplateCode(eventType: NotificationEventType): NotificationTemplateCode {
  if (eventType === 'incident_opened') return 'incident-opened';
  if (eventType === 'incident_acknowledged') return 'incident-acknowledged';
  return 'incident-resolved';
}

function priorityFor(event: IncidentNotificationEvent): NotificationPriority {
  if (event.eventType !== 'IncidentOpened.v1') return 'normal';
  if (event.severity === 'critical') return 'urgent';
  if (event.severity === 'major') return 'high';
  if (event.severity === 'info') return 'low';
  return 'normal';
}
