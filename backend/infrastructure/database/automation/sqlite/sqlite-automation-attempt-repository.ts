import type { AutomationAttemptDto } from '../../../../application/dto/automation/automation-attempt.dto.js';
import type { AutomationAttemptRepository } from '../../../../application/ports/automation/automation-attempt-repository.port.js';
import type { AutomationAttemptTable } from '../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import type { AutomationAttemptStatus } from '../../../../domain/automation/automation-attempt.js';

function toDto(row: AutomationAttemptTable): AutomationAttemptDto {
  return {
    attemptNumber: row.attempt_number,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    createdAt: row.created_at,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    executionId: row.execution_id,
    id: row.id,
    metadataJson: row.metadata_json,
    ...(row.provider_execution_id === null ? {} : { providerExecutionId: row.provider_execution_id }),
    ...(row.response_code === null ? {} : { responseCode: row.response_code }),
    startedAt: row.started_at,
    status: row.status as AutomationAttemptStatus,
  };
}

export class SqliteAutomationAttemptRepository implements AutomationAttemptRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(attempt: AutomationAttemptDto): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('automation_attempts')
        .values({
          attempt_number: attempt.attemptNumber,
          completed_at: attempt.completedAt ?? null,
          created_at: attempt.createdAt,
          error_code: attempt.errorCode ?? null,
          error_message: attempt.errorMessage ?? null,
          execution_id: attempt.executionId,
          id: attempt.id,
          metadata_json: attempt.metadataJson,
          provider_execution_id: attempt.providerExecutionId ?? null,
          response_code: attempt.responseCode ?? null,
          started_at: attempt.startedAt,
          status: attempt.status,
        })
        .onConflict((conflict) =>
          conflict.columns(['execution_id', 'attempt_number']).doUpdateSet({
            completed_at: attempt.completedAt ?? null,
            error_code: attempt.errorCode ?? null,
            error_message: attempt.errorMessage ?? null,
            metadata_json: attempt.metadataJson,
            provider_execution_id: attempt.providerExecutionId ?? null,
            response_code: attempt.responseCode ?? null,
            status: attempt.status,
          }),
        )
        .execute();
    });
  }

  public listByExecution(executionId: string): Promise<readonly AutomationAttemptDto[]> {
    return this.session.execute(async (database) => {
      const rows = await database
        .selectFrom('automation_attempts')
        .selectAll()
        .where('execution_id', '=', executionId)
        .orderBy('attempt_number', 'asc')
        .execute();
      return rows.map(toDto);
    });
  }
}
