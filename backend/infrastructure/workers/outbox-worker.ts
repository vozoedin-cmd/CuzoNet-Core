import { automationEventTypes } from '../../domain/automation/value-objects/event-trigger.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';
import type { WorkerExecutionContext, WorkerRoleHandler } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

const automationConsumer = 'automation';
const supportedAutomationEvents = new Set<string>(automationEventTypes);

export interface OutboxWorkItem {
  eventId: string;
  eventType: string;
}

export class SqliteOutboxWorkRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public findNext(): Promise<OutboxWorkItem | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('outbox_events')
        .select(['id', 'event_type'])
        .where('published_at', 'is', null)
        .orderBy('occurred_at', 'asc')
        .orderBy('id', 'asc')
        .executeTakeFirst();
      return row === undefined ? null : { eventId: row.id, eventType: row.event_type };
    });
  }

  public publish(item: OutboxWorkItem, publishedAt: Date): Promise<boolean> {
    return this.session.transaction(() =>
      this.session.execute(async (database) => {
        const event = await database
          .selectFrom('outbox_events')
          .select(['id', 'event_type', 'published_at'])
          .where('id', '=', item.eventId)
          .executeTakeFirst();
        if (event === undefined || event.published_at !== null) return false;
        if (supportedAutomationEvents.has(event.event_type)) {
          await database
            .insertInto('event_deliveries')
            .values({
              attempt_count: 0,
              consumer_name: automationConsumer,
              event_id: event.id,
              id: `${event.id}:${automationConsumer}`,
              last_error: null,
              next_attempt_at: null,
              processed_at: null,
              status: 'pending',
            })
            .onConflict((conflict) => conflict.columns(['event_id', 'consumer_name']).doNothing())
            .execute();
        }
        const result = await database
          .updateTable('outbox_events')
          .set({ published_at: publishedAt.toISOString() })
          .where('id', '=', event.id)
          .where('published_at', 'is', null)
          .executeTakeFirst();
        return result.numUpdatedRows === 1n;
      }),
    );
  }
}

export class OutboxWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.Outbox;

  public constructor(
    private readonly outbox: SqliteOutboxWorkRepository,
    private readonly clock: Clock,
  ) {}

  public async runOnce(context: WorkerExecutionContext) {
    const item = await this.outbox.findNext();
    if (item === null) return { outcome: 'idle' } as const;
    const execution = await context.withLease(item.eventId, async () =>
      this.outbox.publish(item, this.clock.now()),
    );
    if (!execution.acquired || !execution.value) return { outcome: 'skipped' } as const;
    return { outcome: 'processed' } as const;
  }
}
