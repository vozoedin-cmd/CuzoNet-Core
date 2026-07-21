import type { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationAttempt } from '../../../domain/notifications/notification-attempt.js';
import type { NotificationDestination } from '../../../domain/notifications/notification-destination.js';

export const NotificationMapper = {
  toDto(notification: Notification): Record<string, unknown> {
    const props = notification.props;
    return {
      attempts: props.attempts,
      channel: props.channel,
      companyId: props.companyId,
      createdAt: props.createdAt.toISOString(),
      destinationId: props.destinationId,
      failedAt: props.failedAt?.toISOString() ?? null,
      id: props.id,
      incidentId: props.incidentId,
      lastError: props.lastError ?? null,
      maxAttempts: props.maxAttempts,
      payload: props.payload,
      priority: props.priority,
      scheduledAt: props.scheduledAt.toISOString(),
      sentAt: props.sentAt?.toISOString() ?? null,
      sourceEventId: props.sourceEventId,
      sourceEventType: props.sourceEventType,
      status: props.status,
      templateCode: props.templateCode,
      updatedAt: props.updatedAt.toISOString(),
    };
  },
};

export const NotificationAttemptMapper = {
  toDto(attempt: NotificationAttempt): Record<string, unknown> {
    const props = attempt.props;
    return {
      attemptNumber: props.attemptNumber,
      completedAt: props.completedAt?.toISOString() ?? null,
      errorCode: props.errorCode ?? null,
      errorMessage: props.errorMessage ?? null,
      id: props.id,
      metadata: props.metadata ?? null,
      responseCode: props.responseCode ?? null,
      retryAt: props.retryAt?.toISOString() ?? null,
      startedAt: props.startedAt.toISOString(),
      status: props.status,
    };
  },
};

export const NotificationDestinationMapper = {
  toDto(destination: NotificationDestination): Record<string, unknown> {
    const props = destination.props;
    return {
      address: props.address ?? null,
      channel: props.channel,
      companyId: props.companyId,
      configurationReference: props.configurationReference,
      createdAt: props.createdAt.toISOString(),
      enabled: props.enabled,
      eventTypes: props.eventTypes,
      id: props.id,
      minimumSeverity: props.minimumSeverity ?? null,
      name: props.name,
      updatedAt: props.updatedAt.toISOString(),
    };
  },
};
