import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';

export interface PersistableDomainEvent {
  aggregateId: string;
  aggregateType: string;
  causationId: string;
  correlationId: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: object;
  schemaVersion: number;
}

export class SqliteOutboxRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public append(events: readonly PersistableDomainEvent[]): Promise<void> {
    if (events.length === 0) return Promise.resolve();
    return this.session.execute(async (database) => {
      await database
        .insertInto('outbox_events')
        .values(
          events.map((event) => {
            const companyId = (event.payload as { companyId?: unknown }).companyId;
            if (typeof companyId !== 'string' || companyId.length === 0)
              throw new Error(`Event ${event.eventType} does not contain companyId.`);
            return {
              aggregate_id: event.aggregateId,
              aggregate_type: event.aggregateType,
              causation_id: event.causationId,
              company_id: companyId,
              correlation_id: event.correlationId,
              event_type: event.eventType,
              id: event.eventId,
              occurred_at: event.occurredAt,
              payload: JSON.stringify(event.payload),
              published_at: null,
              schema_version: event.schemaVersion,
            };
          }),
        )
        .onConflict((conflict) => conflict.column('id').doNothing())
        .execute();
    });
  }
}
