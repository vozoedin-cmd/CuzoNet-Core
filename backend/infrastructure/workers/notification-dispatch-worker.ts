import type { Clock } from '../../application/ports/clock.port.js';
import type { NotificationRepository } from '../../application/ports/notifications/repositories.js';
import type { DispatchPendingNotificationUseCase } from '../../application/use-cases/notifications/dispatch-pending-notification.usecase.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

export interface NotificationWorkerLogger {
  error(details: Readonly<Record<string, unknown>>): void;
}

export interface NotificationDispatchWorkerOptions {
  batchSize?: number;
  leaseDurationSeconds?: number;
  workerId: string;
}

export class NotificationDispatchWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.NotificationDispatch;
  private readonly batchSize: number;
  private readonly leaseDurationSeconds: number;
  private readonly workerId: string;

  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly dispatch: DispatchPendingNotificationUseCase,
    private readonly clock: Clock,
    private readonly logger: NotificationWorkerLogger,
    options: NotificationDispatchWorkerOptions,
  ) {
    this.workerId = options.workerId;
    this.batchSize = options.batchSize ?? 20;
    this.leaseDurationSeconds = options.leaseDurationSeconds ?? 60;
  }

  public async runOnce(_context: WorkerExecutionContext) {
    let processed = 0;
    let lastError: string | undefined;
    for (let index = 0; index < this.batchSize; index += 1) {
      const notification = await this.notifications.claimNextPending({
        leaseDurationSeconds: this.leaseDurationSeconds,
        now: this.clock.now(),
        workerId: this.workerId,
      });
      if (notification === null) break;
      try {
        await this.dispatch.execute(notification, this.workerId);
        processed += 1;
      } catch (error) {
        lastError = error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
        this.logger.error({
          action: 'notification.dispatch.failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          module: 'notifications',
          notificationId: notification.props.id,
        });
      }
    }
    if (processed > 0) return { outcome: 'processed' } as const;
    if (lastError !== undefined) return { error: lastError, outcome: 'retried' } as const;
    return { outcome: 'idle' } as const;
  }
}
