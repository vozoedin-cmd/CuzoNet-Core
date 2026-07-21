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
import {
  NotificationAttemptMapper,
  NotificationDestinationMapper,
  NotificationMapper,
} from '../../application/mappers/notifications/notification.mapper.js';
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
    response.status(200).json({ items: notifications.map((notification) => NotificationMapper.toDto(notification)) });
  };

  public readonly getNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    const result = await this.dependencies.getNotification.execute(
      query.companyId,
      params.notificationId,
    );
    response.status(200).json({
      ...NotificationMapper.toDto(result.notification),
      attempts: result.attempts.map((attempt) => NotificationAttemptMapper.toDto(attempt)),
    });
  };

  public readonly retryNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const body = parseNotificationRequest(retryNotificationBodySchema, request.body);
    const notification = await this.dependencies.retryNotification.execute(
      body.companyId,
      params.notificationId,
    );
    response.status(200).json(NotificationMapper.toDto(notification));
  };

  public readonly cancelNotification: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(notificationIdParamsSchema, request.params);
    const body = parseNotificationRequest(cancelNotificationBodySchema, request.body);
    const notification = await this.dependencies.cancelNotification.execute(
      body.companyId,
      params.notificationId,
      body.reason,
    );
    response.status(200).json(NotificationMapper.toDto(notification));
  };

  public readonly listDestinations: RequestHandler = async (request, response) => {
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    const destinations = await this.dependencies.listDestinations.execute(query.companyId);
    response.status(200).json({ items: destinations.map((destination) => NotificationDestinationMapper.toDto(destination)) });
  };

  public readonly createDestination: RequestHandler = async (request, response) => {
    const body = parseNotificationRequest(saveDestinationBodySchema, request.body);
    const { minimumSeverity, address, ...input } = body;
    const destination = await this.dependencies.createDestination.execute({
      ...input,
      ...(minimumSeverity === undefined ? {} : { minimumSeverity }),
      ...(address === undefined ? {} : { address }),
    });
    response.status(201).json(NotificationDestinationMapper.toDto(destination));
  };

  public readonly updateDestination: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(destinationIdParamsSchema, request.params);
    const body = parseNotificationRequest(saveDestinationBodySchema, request.body);
    const { minimumSeverity, address, ...input } = body;
    const destination = await this.dependencies.updateDestination.execute(params.destinationId, {
      ...input,
      ...(minimumSeverity === undefined ? {} : { minimumSeverity }),
      ...(address === undefined ? {} : { address }),
    });
    response.status(200).json(NotificationDestinationMapper.toDto(destination));
  };

  public readonly deleteDestination: RequestHandler = async (request, response) => {
    const params = parseNotificationRequest(destinationIdParamsSchema, request.params);
    const query = parseNotificationRequest(companyQuerySchema, request.query);
    await this.dependencies.deleteDestination.execute(query.companyId, params.destinationId);
    response.status(204).send();
  };
}
