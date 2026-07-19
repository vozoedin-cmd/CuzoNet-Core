import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { NotificationSendResult } from '../../ports/notifications/channels.js';
import type {
  NotificationAttemptRepository,
  NotificationDestinationRepository,
  NotificationRepository,
  NotificationUnitOfWork,
} from '../../ports/notifications/repositories.js';
import { NotificationAttempt } from '../../../domain/notifications/notification-attempt.js';
import type { NotificationRetryPolicy } from '../../../domain/notifications/notification-retry-policy.js';
import type { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationDispatcher } from './notification-dispatcher.js';

export class DispatchPendingNotificationUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly attempts: NotificationAttemptRepository,
    private readonly destinations: NotificationDestinationRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly retryPolicy: NotificationRetryPolicy,
    private readonly unitOfWork: NotificationUnitOfWork,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(notification: Notification, workerId: string): Promise<Notification> {
    const startedAt = this.clock.now();
    const attemptNumber = notification.beginAttempt(startedAt, workerId);
    const attempt = NotificationAttempt.start({
      attemptNumber,
      id: this.idGenerator.generate(),
      notificationId: notification.props.id,
      startedAt,
    });
    await this.unitOfWork.execute(async () => {
      await this.notifications.save(notification);
      await this.attempts.save(attempt);
    });

    const destination = await this.destinations.findById(
      notification.props.companyId,
      notification.props.destinationId,
    );
    const result = await this.dispatcher.dispatch(notification, destination);
    const completedAt = this.clock.now();
    await this.complete(notification, attempt, result, completedAt, workerId);
    return notification;
  }

  private async complete(
    notification: Notification,
    attempt: NotificationAttempt,
    result: NotificationSendResult,
    completedAt: Date,
    workerId: string,
  ): Promise<void> {
    if (result.type === 'success') {
      notification.markSent(completedAt, workerId);
      attempt.complete({
        completedAt,
        ...(result.responseCode === undefined ? {} : { responseCode: result.responseCode }),
        ...(result.safeMetadata === undefined ? {} : { metadata: result.safeMetadata }),
        status: 'sent',
      });
    } else {
      const retryAt =
        result.type === 'retryableFailure'
          ? this.retryPolicy.nextRetryAt(notification.props.attempts, completedAt)
          : null;
      if (retryAt !== null && notification.props.attempts < notification.props.maxAttempts) {
        notification.markRetrying(result.errorMessage, retryAt, completedAt, workerId);
        attempt.complete({
          completedAt,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          ...(result.responseCode === undefined ? {} : { responseCode: result.responseCode }),
          ...(result.safeMetadata === undefined ? {} : { metadata: result.safeMetadata }),
          retryAt,
          status: 'retrying',
        });
      } else {
        notification.markFailed(
          result.errorMessage,
          result.type === 'retryableFailure',
          completedAt,
          workerId,
        );
        attempt.complete({
          completedAt,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          ...(result.responseCode === undefined ? {} : { responseCode: result.responseCode }),
          ...(result.safeMetadata === undefined ? {} : { metadata: result.safeMetadata }),
          status: 'failed',
        });
      }
    }
    await this.unitOfWork.execute(async () => {
      await this.notifications.save(notification);
      await this.attempts.save(attempt);
    });
  }
}
