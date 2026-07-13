import type {
  AutomationEventReceiptPort,
  AutomationEventReceiptStatus,
} from '../../../../application/ports/automation/automation-event-receipt.port.js';
import type { Clock } from '../../../../application/ports/clock.port.js';
import type { IdGenerator } from '../../../../application/ports/id-generator.port.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';

const consumerName = 'automation';

export class SqliteAutomationEventReceipt implements AutomationEventReceiptPort {
  public constructor(
    private readonly session: SqliteDatabaseSession,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public getStatus(
    _companyId: string,
    eventId: string,
  ): Promise<AutomationEventReceiptStatus | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('event_deliveries')
        .select('status')
        .where('event_id', '=', eventId)
        .where('consumer_name', '=', consumerName)
        .executeTakeFirst();
      if (row === undefined || row.status === 'pending') return null;
      return row.status as AutomationEventReceiptStatus;
    });
  }

  public mark(
    _companyId: string,
    eventId: string,
    status: AutomationEventReceiptStatus,
  ): Promise<void> {
    return this.session.execute(async (database) => {
      const now = this.clock.now().toISOString();
      await database
        .insertInto('event_deliveries')
        .values({
          attempt_count: status === 'processing' ? 1 : 0,
          consumer_name: consumerName,
          event_id: eventId,
          id: this.idGenerator.generate(),
          last_error: null,
          next_attempt_at: null,
          processed_at: status === 'processed' ? now : null,
          status,
        })
        .onConflict((conflict) =>
          conflict.columns(['event_id', 'consumer_name']).doUpdateSet((expression) => ({
            attempt_count:
              status === 'processing'
                ? expression('event_deliveries.attempt_count', '+', 1)
                : expression.ref('event_deliveries.attempt_count'),
            processed_at: status === 'processed' ? now : null,
            status,
          })),
        )
        .execute();
    });
  }
}
