import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';
import type { WorkerStatisticEvent, WorkerStatisticsRepository } from '../worker-contracts.js';
import type { WorkerRole } from '../worker-role.js';

export class SqliteWorkerStatisticsRepository implements WorkerStatisticsRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public recordStarted(role: WorkerRole, workerId: string, at: Date): Promise<void> {
    return this.session.execute(async (database) => {
      const timestamp = at.toISOString();
      await database
        .insertInto('worker_statistics')
        .values({
          failed_count: 0,
          heartbeat_at: timestamp,
          last_error: null,
          last_error_at: null,
          last_success_at: null,
          lease_lost_count: 0,
          processed_count: 0,
          retry_count: 0,
          role,
          skipped_count: 0,
          started_at: timestamp,
          stopped_at: null,
          worker_id: workerId,
        })
        .onConflict((conflict) =>
          conflict.columns(['role', 'worker_id']).doUpdateSet({
            heartbeat_at: timestamp,
            started_at: timestamp,
            stopped_at: null,
          }),
        )
        .execute();
    });
  }

  public recordHeartbeat(role: WorkerRole, workerId: string, at: Date): Promise<void> {
    return this.update(role, workerId, { heartbeat_at: at.toISOString() });
  }

  public recordResult(
    role: WorkerRole,
    workerId: string,
    event: WorkerStatisticEvent,
    at: Date,
    error?: string,
  ): Promise<void> {
    return this.session.execute(async (database) => {
      const timestamp = at.toISOString();
      await database
        .updateTable('worker_statistics')
        .set((expression) => ({
          failed_count:
            event === 'failed' || event === 'retried'
              ? expression('failed_count', '+', 1)
              : expression.ref('failed_count'),
          heartbeat_at: timestamp,
          last_error:
            event === 'failed' || event === 'retried' || event === 'lease_lost'
              ? (error ?? event)
              : expression.ref('last_error'),
          last_error_at:
            event === 'failed' || event === 'retried' || event === 'lease_lost'
              ? timestamp
              : expression.ref('last_error_at'),
          last_success_at: event === 'processed' ? timestamp : expression.ref('last_success_at'),
          lease_lost_count:
            event === 'lease_lost'
              ? expression('lease_lost_count', '+', 1)
              : expression.ref('lease_lost_count'),
          processed_count:
            event === 'processed'
              ? expression('processed_count', '+', 1)
              : expression.ref('processed_count'),
          retry_count:
            event === 'retried' ? expression('retry_count', '+', 1) : expression.ref('retry_count'),
          skipped_count:
            event === 'skipped'
              ? expression('skipped_count', '+', 1)
              : expression.ref('skipped_count'),
        }))
        .where('role', '=', role)
        .where('worker_id', '=', workerId)
        .execute();
    });
  }

  public recordStopped(role: WorkerRole, workerId: string, at: Date): Promise<void> {
    const timestamp = at.toISOString();
    return this.update(role, workerId, { heartbeat_at: timestamp, stopped_at: timestamp });
  }

  private update(
    role: WorkerRole,
    workerId: string,
    values: { heartbeat_at: string; stopped_at?: string },
  ): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .updateTable('worker_statistics')
        .set(values)
        .where('role', '=', role)
        .where('worker_id', '=', workerId)
        .execute();
    });
  }
}
