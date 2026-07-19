import type { ConsumedDomainEventDto } from '../../application/dto/automation/consumed-domain-event.dto.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { AutomationEventType } from '../../domain/automation/value-objects/event-trigger.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

const automationConsumer = 'automation';

export interface AutomationEventEvaluator {
  execute(event: unknown): Promise<unknown>;
}

export interface AutomationWorkItem {
  attemptCount: number;
  deliveryId: string;
  event: ConsumedDomainEventDto;
}

export class SqliteAutomationWorkRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public findNext(at: Date): Promise<AutomationWorkItem | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('event_deliveries as delivery')
        .innerJoin('outbox_events as event', 'event.id', 'delivery.event_id')
        .leftJoin('work_leases as lease', (join) =>
          join.onRef('lease.work_id', '=', 'event.id').on('lease.role', '=', WorkerRole.Automation),
        )
        .select([
          'delivery.attempt_count as attempt_count',
          'delivery.id as delivery_id',
          'event.aggregate_id as aggregate_id',
          'event.aggregate_type as aggregate_type',
          'event.causation_id as causation_id',
          'event.company_id as company_id',
          'event.correlation_id as correlation_id',
          'event.event_type as event_type',
          'event.id as event_id',
          'event.occurred_at as occurred_at',
          'event.payload as payload',
          'event.schema_version as schema_version',
        ])
        .where('delivery.consumer_name', '=', automationConsumer)
        .where((expression) =>
          expression.or([
            expression('delivery.status', '=', 'pending'),
            expression.and([
              expression('delivery.status', '=', 'failed'),
              expression('delivery.next_attempt_at', 'is not', null),
              expression('delivery.next_attempt_at', '<=', at.toISOString()),
            ]),
            expression.and([
              expression('delivery.status', '=', 'processing'),
              expression.or([
                expression('lease.work_id', 'is', null),
                expression('lease.expires_at', '<=', at.toISOString()),
              ]),
            ]),
          ]),
        )
        .orderBy('event.occurred_at', 'asc')
        .orderBy('event.id', 'asc')
        .executeTakeFirst();
      if (row === undefined) return null;
      const payload: unknown = JSON.parse(row.payload);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        throw new Error(`Payload inválido en outbox event ${row.event_id}.`);
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
          eventType: row.event_type as AutomationEventType,
          occurredAt: row.occurred_at,
          payload: payload as Record<string, unknown>,
          schemaVersion: row.schema_version as 1,
        },
      };
    });
  }

  public markFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: Date | null,
    attemptCount: number,
  ): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .updateTable('event_deliveries')
        .set({
          attempt_count: attemptCount,
          last_error: error.slice(0, 2_000),
          next_attempt_at: nextAttemptAt?.toISOString() ?? null,
          processed_at: null,
          status: 'failed',
        })
        .where('id', '=', deliveryId)
        .execute();
    });
  }
}

export interface AutomationOutboxWorkerOptions {
  baseRetryDelayMs?: number;
  maxAttempts?: number;
}

export class AutomationOutboxWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.Automation;
  private readonly baseRetryDelayMs: number;
  private readonly maxAttempts: number;

  public constructor(
    private readonly work: SqliteAutomationWorkRepository,
    private readonly evaluator: AutomationEventEvaluator,
    private readonly clock: Clock,
    options: AutomationOutboxWorkerOptions = {},
  ) {
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isInteger(this.baseRetryDelayMs) || this.baseRetryDelayMs < 1)
      throw new RangeError('baseRetryDelayMs debe ser un entero mayor que cero.');
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1)
      throw new RangeError('maxAttempts debe ser un entero mayor que cero.');
  }

  public async runOnce(context: WorkerExecutionContext) {
    const item = await this.work.findNext(this.clock.now());
    if (item === null) return { outcome: 'idle' } as const;
    const execution = await context.withLease(item.event.eventId, async (signal) => {
      if (signal.aborted) throw signal.reason;
      try {
        await this.evaluator.execute(item.event);
        return { outcome: 'processed' } as const;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
        const attempt = item.attemptCount + 1;
        const nextAttemptAt =
          attempt >= this.maxAttempts
            ? null
            : new Date(this.clock.now().getTime() + this.baseRetryDelayMs * 2 ** (attempt - 1));
        await this.work.markFailed(item.deliveryId, message, nextAttemptAt, attempt);
        return { error: message, outcome: 'retried' } as const;
      }
    });
    return execution.acquired ? execution.value : ({ outcome: 'skipped' } as const);
  }
}
