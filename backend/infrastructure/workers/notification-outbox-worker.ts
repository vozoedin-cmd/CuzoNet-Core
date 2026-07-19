import type { Clock } from '../../application/ports/clock.port.js';
import type { NotificationOutboxEnvelope } from '../../application/ports/notifications/notification-event.port.js';
import type { NotificationEventHandler } from '../../application/use-cases/notifications/notification-event-handler.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

const consumerName = 'notifications';

export interface NotificationOutboxWorkItem {
  attemptCount: number;
  deliveryId: string;
  event: NotificationOutboxEnvelope;
}

export class SqliteNotificationOutboxWorkRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public findNext(at: Date): Promise<NotificationOutboxWorkItem | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('event_deliveries as delivery')
        .innerJoin('outbox_events as event', 'event.id', 'delivery.event_id')
        .select([
          'delivery.attempt_count',
          'delivery.id as delivery_id',
          'event.aggregate_id',
          'event.aggregate_type',
          'event.causation_id',
          'event.company_id',
          'event.correlation_id',
          'event.event_type',
          'event.id as event_id',
          'event.occurred_at',
          'event.payload',
          'event.schema_version',
        ])
        .where('delivery.consumer_name', '=', consumerName)
        .where((expression) =>
          expression.or([
            expression('delivery.status', '=', 'pending'),
            expression.and([
              expression('delivery.status', '=', 'failed'),
              expression('delivery.next_attempt_at', 'is not', null),
              expression('delivery.next_attempt_at', '<=', at.toISOString()),
            ]),
          ]),
        )
        .orderBy('event.occurred_at', 'asc')
        .orderBy('event.id', 'asc')
        .executeTakeFirst();
      if (row === undefined) return null;
      const payload: unknown = JSON.parse(row.payload);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        throw new TypeError(`Payload inválido en outbox event ${row.event_id}.`);
      return {
        attemptCount: row.attempt_count,
        deliveryId: row.delivery_id,
        event: {
          aggregateId: row.aggregate_id,
          aggregateType: row.aggregate_type,
          causationId: row.causation_id,
          companyId: row.company_id,
          correlationId: row.correlation_id,
          eventId: row.event_id,
          eventType: row.event_type,
          occurredAt: row.occurred_at,
          payload: payload as Record<string, unknown>,
          schemaVersion: row.schema_version,
        },
      };
    });
  }

  public markProcessed(deliveryId: string, at: Date): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .updateTable('event_deliveries')
        .set({
          last_error: null,
          next_attempt_at: null,
          processed_at: at.toISOString(),
          status: 'processed',
        })
        .where('id', '=', deliveryId)
        .where('consumer_name', '=', consumerName)
        .execute();
    });
  }

  public markFailed(
    deliveryId: string,
    error: string,
    attemptCount: number,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .updateTable('event_deliveries')
        .set({
          attempt_count: attemptCount,
          last_error: error.replace(/[\r\n\t]+/g, ' ').slice(0, 1_000),
          next_attempt_at: nextAttemptAt?.toISOString() ?? null,
          processed_at: null,
          status: 'failed',
        })
        .where('id', '=', deliveryId)
        .where('consumer_name', '=', consumerName)
        .execute();
    });
  }
}

export interface NotificationOutboxWorkerOptions {
  baseRetryDelayMs?: number;
  maxAttempts?: number;
}

export class NotificationOutboxWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.NotificationOutbox;
  private readonly baseRetryDelayMs: number;
  private readonly maxAttempts: number;

  public constructor(
    private readonly work: SqliteNotificationOutboxWorkRepository,
    private readonly handler: NotificationEventHandler,
    private readonly clock: Clock,
    options: NotificationOutboxWorkerOptions = {},
    private readonly logger: { error(details: Readonly<Record<string, unknown>>): void } = {
      error: () => undefined,
    },
  ) {
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  public async runOnce(context: WorkerExecutionContext) {
    const item = await this.work.findNext(this.clock.now());
    if (item === null) return { outcome: 'idle' } as const;
    const execution = await context.withLease(item.event.eventId, async (signal) => {
      if (signal.aborted) throw signal.reason;
      try {
        await this.handler.handle(item.event);
        await this.work.markProcessed(item.deliveryId, this.clock.now());
        return { outcome: 'processed' } as const;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
        this.logger.error({
          action: 'notification.outbox.failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          eventId: item.event.eventId,
          module: 'notifications',
        });
        const attempt = item.attemptCount + 1;
        const nextAttemptAt =
          attempt >= this.maxAttempts
            ? null
            : new Date(this.clock.now().getTime() + this.baseRetryDelayMs * 2 ** (attempt - 1));
        await this.work.markFailed(item.deliveryId, message, attempt, nextAttemptAt);
        return { error: message, outcome: 'retried' } as const;
      }
    });
    return execution.acquired ? execution.value : ({ outcome: 'skipped' } as const);
  }
}
