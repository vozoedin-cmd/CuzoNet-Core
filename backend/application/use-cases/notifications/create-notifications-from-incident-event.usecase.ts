import { z } from 'zod';

import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { NotificationOutboxEnvelope } from '../../ports/notifications/notification-event.port.js';
import type {
  NotificationDestinationRepository,
  NotificationEventReceiptRepository,
  NotificationRepository,
  NotificationUnitOfWork,
} from '../../ports/notifications/repositories.js';
import { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationPolicy } from '../../../domain/notifications/notification-policy.js';
import type { IncidentNotificationEvent } from '../../../domain/notifications/types.js';

const severitySchema = z.enum(['info', 'warning', 'minor', 'major', 'critical']);
const supportedEventTypeSchema = z.enum([
  'IncidentOpened.v1',
  'IncidentAcknowledged.v1',
  'IncidentResolved.v1',
]);
const incidentEventPayloadSchema = z.strictObject({
  companyId: z.string().trim().min(1),
  equipmentId: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  incidentId: z.string().trim().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  ruleId: z.string().trim().min(1),
  severity: severitySchema,
});
const envelopeSchema = z.strictObject({
  aggregateId: z.string().trim().min(1),
  aggregateType: z.literal('Incident'),
  causationId: z.string(),
  companyId: z.string().trim().min(1),
  correlationId: z.string(),
  eventId: z.string().trim().min(1),
  eventType: supportedEventTypeSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  payload: incidentEventPayloadSchema,
  schemaVersion: z.literal(1),
});

export interface CreateNotificationsResult {
  createdNotifications: number;
  duplicate: boolean;
}

export class CreateNotificationsFromIncidentEventUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly destinations: NotificationDestinationRepository,
    private readonly receipts: NotificationEventReceiptRepository,
    private readonly policy: NotificationPolicy,
    private readonly unitOfWork: NotificationUnitOfWork,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly maxAttempts = 5,
  ) {}

  public execute(rawEvent: NotificationOutboxEnvelope): Promise<CreateNotificationsResult> {
    const event = parseIncidentEvent(rawEvent);
    return this.unitOfWork.execute(async () => {
      const existingReceipt = await this.receipts.findByEventId(event.eventId);
      if (existingReceipt !== null)
        return {
          createdNotifications: existingReceipt.createdNotifications,
          duplicate: true,
        };

      const destinations = await this.destinations.list(event.companyId);
      const commands = this.policy.select(event, destinations);
      const now = this.clock.now();
      let createdNotifications = 0;
      for (const command of commands) {
        const destination = command.destination.props;
        const idempotencyKey = Notification.idempotencyKeyFor({
          channel: destination.channel,
          companyId: event.companyId,
          destinationId: destination.id,
          sourceEventId: event.eventId,
        });
        const existing = await this.notifications.findByIdempotencyKey(
          event.companyId,
          idempotencyKey,
        );
        if (existing !== null) continue;
        await this.notifications.save(
          Notification.create({
            channel: destination.channel,
            companyId: event.companyId,
            createdAt: now,
            destinationId: destination.id,
            id: this.idGenerator.generate(),
            incidentId: event.incidentId,
            maxAttempts: this.maxAttempts,
            payload: event,
            priority: command.priority,
            scheduledAt: now,
            sourceEventId: event.eventId,
            sourceEventType: command.eventType,
            templateCode: command.templateCode,
          }),
        );
        createdNotifications += 1;
      }
      await this.receipts.save({
        companyId: event.companyId,
        createdNotifications,
        eventId: event.eventId,
        eventType: event.eventType,
        processedAt: now,
        status: 'processed',
      });
      return { createdNotifications, duplicate: false };
    });
  }
}

export function parseIncidentEvent(
  rawEvent: NotificationOutboxEnvelope,
): IncidentNotificationEvent {
  const result = envelopeSchema.safeParse(rawEvent);
  if (!result.success) throw new TypeError(`Evento de incidente inválido: ${result.error.message}`);
  const event = result.data;
  if (
    event.companyId !== event.payload.companyId ||
    event.eventId !== event.payload.eventId ||
    event.aggregateId !== event.payload.incidentId ||
    event.occurredAt !== event.payload.occurredAt
  )
    throw new TypeError('El envelope y el payload del evento de incidente no coinciden.');
  return Object.freeze({ ...event.payload, eventType: event.eventType });
}
