import type {
  AutomationExecutionDto,
} from '../../../../application/dto/automation/automation-execution.dto.js';
import type { AutomationExecutionRepository } from '../../../../application/ports/automation/automation-execution-repository.port.js';
import type { AutomationExecutionTable } from '../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import type { AutomationExecutionStatus } from '../../../../domain/automation/automation-execution.js';

function toDto(row: AutomationExecutionTable): AutomationExecutionDto {
  return {
    actionSnapshotJson: row.action_snapshot_json,
    actionType: row.action_type,
    attemptCount: row.attempt_count,
    ...(row.cancelled_at === null ? {} : { cancelledAt: row.cancelled_at }),
    companyId: row.company_id,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    createdAt: row.created_at,
    eventId: row.event_id,
    eventSnapshotJson: row.event_snapshot_json,
    eventType: row.event_type,
    id: row.id,
    ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
    ...(row.last_error_message === null ? {} : { lastErrorMessage: row.last_error_message }),
    maxAttempts: row.max_attempts,
    ...(row.next_attempt_at === null ? {} : { nextAttemptAt: row.next_attempt_at }),
    ...(row.processing_lease_until === null ? {} : { processingLeaseUntil: row.processing_lease_until }),
    ...(row.processing_started_at === null ? {} : { processingStartedAt: row.processing_started_at }),
    ...(row.processing_worker_id === null ? {} : { processingWorkerId: row.processing_worker_id }),
    ...(row.provider_execution_id === null ? {} : { providerExecutionId: row.provider_execution_id }),
    ruleId: row.rule_id,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    status: row.status as AutomationExecutionStatus,
    updatedAt: row.updated_at,
  };
}

export class SqliteAutomationExecutionRepository implements AutomationExecutionRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(companyId: string, execution: AutomationExecutionDto): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('automation_executions')
        .values({
          action_snapshot_json: execution.actionSnapshotJson,
          action_type: execution.actionType,
          attempt_count: execution.attemptCount,
          cancelled_at: execution.cancelledAt ?? null,
          company_id: companyId,
          completed_at: execution.completedAt ?? null,
          created_at: execution.createdAt,
          event_id: execution.eventId,
          event_snapshot_json: execution.eventSnapshotJson,
          event_type: execution.eventType,
          id: execution.id,
          last_error_code: execution.lastErrorCode ?? null,
          last_error_message: execution.lastErrorMessage ?? null,
          max_attempts: execution.maxAttempts,
          next_attempt_at: execution.nextAttemptAt ?? null,
          processing_lease_until: execution.processingLeaseUntil ?? null,
          processing_started_at: execution.processingStartedAt ?? null,
          processing_worker_id: execution.processingWorkerId ?? null,
          provider_execution_id: execution.providerExecutionId ?? null,
          rule_id: execution.ruleId,
          started_at: execution.startedAt ?? null,
          status: execution.status,
          updated_at: execution.updatedAt,
        })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            attempt_count: execution.attemptCount,
            cancelled_at: execution.cancelledAt ?? null,
            completed_at: execution.completedAt ?? null,
            last_error_code: execution.lastErrorCode ?? null,
            last_error_message: execution.lastErrorMessage ?? null,
            next_attempt_at: execution.nextAttemptAt ?? null,
            processing_lease_until: execution.processingLeaseUntil ?? null,
            processing_started_at: execution.processingStartedAt ?? null,
            processing_worker_id: execution.processingWorkerId ?? null,
            provider_execution_id: execution.providerExecutionId ?? null,
            started_at: execution.startedAt ?? null,
            status: execution.status,
            updated_at: execution.updatedAt,
          }),
        )
        .execute();
    });
  }

  public findUnique(
    companyId: string,
    eventId: string,
    ruleId: string,
  ): Promise<AutomationExecutionDto | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('automation_executions')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('event_id', '=', eventId)
        .where('rule_id', '=', ruleId)
        .executeTakeFirst();
      return row === undefined ? null : toDto(row);
    });
  }

  public findById(companyId: string, executionId: string): Promise<AutomationExecutionDto | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('automation_executions')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', executionId)
        .executeTakeFirst();
      return row === undefined ? null : toDto(row);
    });
  }

  public claimDue(
    workerId: string,
    now: Date,
    leaseUntil: Date,
    limit: number,
  ): Promise<readonly AutomationExecutionDto[]> {
    return this.session.execute(async (database) => {
      // Find rows that are either pending, or retrying and past nextAttemptAt, or processing and past lease
      const nowStr = now.toISOString();

      const rows = await database
        .selectFrom('automation_executions')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('status', '=', 'pending'),
            eb.and([
              eb('status', '=', 'retrying'),
              eb('next_attempt_at', '<=', nowStr)
            ]),
            eb.and([
              eb('status', '=', 'processing'),
              eb('processing_lease_until', '<=', nowStr)
            ])
          ])
        )
        .orderBy('created_at', 'asc')
        .limit(limit)
        .execute();

      if (rows.length === 0) return [];

      const ids = rows.map(r => r.id);

      await database
        .updateTable('automation_executions')
        .set({
          status: 'processing',
          processing_worker_id: workerId,
          processing_started_at: nowStr,
          processing_lease_until: leaseUntil.toISOString(),
          updated_at: nowStr,
          started_at: (eb) => eb.fn.coalesce('started_at', eb.val(nowStr))
        })
        .where('id', 'in', ids)
        .execute();

      // Fetch the claimed rows to return their updated state
      const claimedRows = await database
        .selectFrom('automation_executions')
        .selectAll()
        .where('id', 'in', ids)
        .where('processing_worker_id', '=', workerId)
        .where('processing_started_at', '=', nowStr)
        .execute();

      return claimedRows.map(toDto);
    });
  }
}
