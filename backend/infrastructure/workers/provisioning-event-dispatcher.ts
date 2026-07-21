import type { ProvisioningEventEnvelope } from '../../application/ports/provisioning/provisioning-event-envelope.js';
import type { ProvisioningEventPublisherPort } from '../../application/ports/provisioning/provisioning-event-publisher.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import {
  noOpProvisioningEventLogger,
  type ProvisioningEventLogger,
} from '../../application/use-cases/provisioning/shared/publish-provisioning-events.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

const consumerName = 'provisioning-events';

export interface ProvisioningEventWorkItem {
  attemptCount: number;
  deliveryId: string;
  event: ProvisioningEventEnvelope;
}

export class SqliteProvisioningEventWorkRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public findNext(at: Date): Promise<ProvisioningEventWorkItem | null> {
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
          // Only rows fanned out to this consumer by the shared OutboxWorker
          // reach here, and it only fans out the four supported event types.
          eventType: row.event_type as ProvisioningEventEnvelope['eventType'],
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

export interface ProvisioningEventDispatcherOptions {
  baseRetryDelayMs?: number;
  maxAttempts?: number;
}

/**
 * Stage 2 of the outbox pipeline for provisioning events: the shared
 * OutboxWorker (Stage 1) already fanned ProvisioningRequested/Succeeded/
 * Failed/RetryScheduled events out into `event_deliveries` rows for the
 * "provisioning-events" consumer; this worker reads them one at a time,
 * hands each to ProvisioningEventPublisherPort, and records the outcome.
 * Idempotency comes from the existing infrastructure, not new code:
 * work_leases (via WorkerExecutionContext.withLease) stop two workers from
 * processing the same delivery concurrently, and event_deliveries.status
 * moving to 'processed' stops findNext from ever selecting it again.
 */
export class ProvisioningEventDispatcher implements WorkerRoleHandler {
  public readonly role = WorkerRole.ProvisioningEventDispatch;
  private readonly baseRetryDelayMs: number;
  private readonly maxAttempts: number;

  public constructor(
    private readonly work: SqliteProvisioningEventWorkRepository,
    private readonly publisher: ProvisioningEventPublisherPort,
    private readonly clock: Clock,
    options: ProvisioningEventDispatcherOptions = {},
    private readonly logger: ProvisioningEventLogger = noOpProvisioningEventLogger,
  ) {
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  public async runOnce(context: WorkerExecutionContext) {
    const item = await this.work.findNext(this.clock.now());
    if (item === null) return { outcome: 'idle' } as const;

    const execution = await context.withLease(item.event.eventId, async (signal) => {
      if (signal.aborted) throw signal.reason;
      const startedAt = Date.now();
      const attempt = item.attemptCount + 1;

      try {
        await this.publisher.publish(item.event);
        await this.work.markProcessed(item.deliveryId, this.clock.now());
        this.logger.info({
          attempt,
          consumer: consumerName,
          duration: Date.now() - startedAt,
          eventId: item.event.eventId,
          eventType: item.event.eventType,
          published: true,
        });
        return { outcome: 'processed' } as const;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
        const nextAttemptAt =
          attempt >= this.maxAttempts
            ? null
            : new Date(this.clock.now().getTime() + this.baseRetryDelayMs * 2 ** (attempt - 1));
        await this.work.markFailed(item.deliveryId, message, attempt, nextAttemptAt);
        this.logger.warn({
          attempt,
          consumer: consumerName,
          duration: Date.now() - startedAt,
          eventId: item.event.eventId,
          eventType: item.event.eventType,
          published: false,
        });
        return { error: message, outcome: 'retried' } as const;
      }
    });

    return execution.acquired ? execution.value : ({ outcome: 'skipped' } as const);
  }
}
