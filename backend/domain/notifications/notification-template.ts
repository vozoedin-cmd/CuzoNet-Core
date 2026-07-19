import type { IncidentNotificationEvent, NotificationChannelType } from './types.js';

export const notificationTemplateCodes = [
  'incident-opened',
  'incident-acknowledged',
  'incident-resolved',
] as const;

export type NotificationTemplateCode = (typeof notificationTemplateCodes)[number];

export interface NotificationTemplateProps {
  code: NotificationTemplateCode;
  name: string;
}

export class NotificationTemplate {
  private constructor(public readonly props: Readonly<NotificationTemplateProps>) {}

  public static fromCode(code: NotificationTemplateCode): NotificationTemplate {
    const names: Record<NotificationTemplateCode, string> = {
      'incident-acknowledged': 'Incident acknowledged',
      'incident-opened': 'Incident opened',
      'incident-resolved': 'Incident resolved',
    };
    return new NotificationTemplate(Object.freeze({ code, name: names[code] }));
  }
}

export interface RenderedNotification {
  structuredPayload?: Readonly<Record<string, unknown>>;
  subject?: string;
  text: string;
}

export class NotificationTemplateRenderer {
  public render(input: {
    channel: NotificationChannelType;
    event: IncidentNotificationEvent;
    notificationId: string;
    priority: string;
    templateCode: string;
  }): RenderedNotification {
    const template = this.template(input.templateCode);
    const status =
      input.event.eventType === 'IncidentResolved.v1'
        ? 'resolved'
        : input.event.eventType === 'IncidentAcknowledged.v1'
          ? 'acknowledged'
          : 'open';
    const heading = template.props.name.toUpperCase();
    const text = [
      heading,
      `Equipment: ${input.event.equipmentId}`,
      `Severity: ${input.event.severity}`,
      `Rule: ${input.event.ruleId}`,
      `Occurred at: ${input.event.occurredAt}`,
      `Incident ID: ${input.event.incidentId}`,
    ].join('\n');
    const structuredPayload = Object.freeze({
      companyId: input.event.companyId,
      eventId: input.event.eventId,
      eventType: input.event.eventType,
      incident: Object.freeze({
        equipmentId: input.event.equipmentId,
        id: input.event.incidentId,
        ruleId: input.event.ruleId,
        severity: input.event.severity,
        status,
      }),
      notification: Object.freeze({ id: input.notificationId, priority: input.priority }),
      occurredAt: input.event.occurredAt,
    });
    return {
      structuredPayload,
      subject: heading,
      text,
    };
  }

  private template(code: string): NotificationTemplate {
    if (!notificationTemplateCodes.includes(code as NotificationTemplateCode))
      throw new TypeError(`Plantilla no soportada: ${code}.`);
    return NotificationTemplate.fromCode(code as NotificationTemplateCode);
  }
}
