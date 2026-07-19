import type { RequestHandler } from 'express';

import type { CancelNotificationUseCase } from '../../application/use-cases/notifications/cancel-notification.usecase.js';
import type { GetNotificationUseCase } from '../../application/use-cases/notifications/get-notification.usecase.js';
import type { ListNotificationsUseCase } from '../../application/use-cases/notifications/list-notifications.usecase.js';
import type {
  CreateNotificationDestinationUseCase,
  DeleteNotificationDestinationUseCase,
  ListNotificationDestinationsUseCase,
  UpdateNotificationDestinationUseCase,
} from '../../application/use-cases/notifications/manage-notification-destinations.usecase.js';
import type { RetryNotificationUseCase } from '../../application/use-cases/notifications/retry-notification.usecase.js';
import type { Notification } from '../../domain/notifications/notification.js';
import type { NotificationAttempt } from '../../domain/notifications/notification-attempt.js';
import type { NotificationDestination } from '../../domain/notifications/notification-destination.js';
import {
  cancelNotificationBodySchema,
  companyQuerySchema,
  destinationIdParamsSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  parseNotificationRequest,
  retryNotificationBodySchema,
  saveDestinationBodySchema,
} from './notifications.schemas.js';

export interface NotificationsControllerDependencies {
  cancelNotification: CancelNotificationUseCase;
  createDestination: CreateNotificationDestinationUseCase;
  deleteDestination: DeleteNotificationDestinationUseCase;
  getNotification: GetNotificationUseCase;
  listDestinations: ListNotificationDestinationsUseCase;
  listNotifications: ListNotificationsUseCase;
  retryNotification: RetryNotificationUseCase;
  updateDestination: UpdateNotificationDestinationUseCase;
}

export class NotificationsController {
  public constructor(private readonly dependencies: NotificationsControllerDependencies) {}

  public readonly listNotifications: RequestHandler = async (request, response) => {
    const query = parseNotificationRequest(notificationListQuerySchema, request.query);
    const notifications = await this.dependencies.listNotifications.execute(query.companyId, {
      ...(query.channel === undefined ? {} : { channel: query.channel }),
      ...(query.dateFrom === undefined ? {} : { dateFrom: new Date(query.dateFrom) }),
      ...(query.dateTo === undefined ? {} : { dateTo: new Date(query.dateTo) }),
      ...(query.destinationId === undefined ? {} : { destinationId: query.destinationId }),
      ...(query.incidentId === undefined ? {} : { incidentId: query.incidentId }),
      limit: query.limit,
      offset: query.offset,
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    response.status(200).json({ items: notifications.map(toNotificationDto) });
  };

  public readonly getNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    const result = await this.dependencies.getNotification.execute(
      query.companyId,
      params.notificationId,
    );
    response.status(200).json({
      ...toNotificationDto(result.notification),
      attempts: result.attempts.map(toAttemptDto),
    });
  };

  public readonly retryNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const body = parseNotificationRequest(retryNotificationBodySchema, request.body);
    const notification = await this.dependencies.retryNotification.execute(
      body.companyId,
      params.notificationId,
    );
    response.status(200).json(toNotificationDto(notification));
  };

  public readonly cancelNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const body = parseNotificationRequest(cancelNotificationBodySchema, request.body);
    const notification = await this.dependencies.cancelNotification.execute(
      body.companyId,
      params.notificationId,
      body.reason,
    );
    response.status(200).json(toNotificationDto(notification));
  };

  public readonly listDestinations: RequestHandler = async (request, response) => {
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    const destinations = await this.dependencies.listDestinations.execute(query.companyId);
    response.status(200).json({ items: destinations.map(toDestinationDto) });
  };

  public readonly createDestination: RequestHandler = async (request, response) => {
    const body = parseNotificationRequest(saveDestinationBodySchema, request.body);
    const { minimumSeverity, ...input } = body;
    const destination = await this.dependencies.createDestination.execute({
      ...input,
      ...(minimumSeverity === undefined ? {} : { minimumSeverity }),
    });
    response.status(201).json(toDestinationDto(destination));
  };

  public readonly updateDestination: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(destinationIdParamsSchema, request.params);
    const body = parseNotificationRequest(saveDestinationBodySchema, request.body);
    const { minimumSeverity, ...input } = body;
    const destination = await this.dependencies.updateDestination.execute(params.destinationId, {
      ...input,
      ...(minimumSeverity === undefined ? {} : { minimumSeverity }),
    });
    response.status(200).json(toDestinationDto(destination));
  };

  public readonly deleteDestination: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(destinationIdParamsSchema, request.params);
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    await this.dependencies.deleteDestination.execute(query.companyId, params.destinationId);
    response.status(204).send();
  };
}

function toNotificationDto(notification: Notification): Record<string, unknown> {
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
}

function toAttemptDto(attempt: NotificationAttempt): Record<string, unknown> {
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
}

function toDestinationDto(destination: NotificationDestination): Record<string, unknown> {
  const props = destination.props;
  return {
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
}
