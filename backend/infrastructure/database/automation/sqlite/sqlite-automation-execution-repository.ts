import type {
  AutomationExecutionDto,
  AutomationExecutionStatus,
} from '../../../../application/dto/automation/automation-execution.dto.js';
import type {
  AutomationExecutionListCriteria,
  AutomationExecutionReader,
} from '../../../../application/ports/automation/automation-execution-reader.port.js';
import type { AutomationExecutionRepository } from '../../../../application/ports/automation/automation-execution-repository.port.js';
import type { AutomationExecutionTable } from '../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';

function toDto(row: AutomationExecutionTable): AutomationExecutionDto {
  return {
    actionResults: JSON.parse(row.action_results) as AutomationExecutionDto['actionResults'],
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    contextId: row.context_id,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    eventId: row.event_id,
    id: row.id,
    matched: row.matched === 1,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    startedAt: row.started_at,
    status: row.status as AutomationExecutionStatus,
  };
}

export class SqliteAutomationExecutionRepository
  implements AutomationExecutionRepository, AutomationExecutionReader
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(companyId: string, execution: AutomationExecutionDto): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('automation_executions')
        .values({
          action_results: JSON.stringify(execution.actionResults),
          company_id: companyId,
          completed_at: execution.completedAt ?? null,
          context_id: execution.contextId,
          error_code: execution.errorCode ?? null,
          error_message: execution.errorMessage ?? null,
          event_id: execution.eventId,
          id: execution.id,
          matched: execution.matched ? 1 : 0,
          rule_id: execution.ruleId,
          rule_version: execution.ruleVersion,
          started_at: execution.startedAt,
          status: execution.status,
        })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            action_results: JSON.stringify(execution.actionResults),
            completed_at: execution.completedAt ?? null,
            error_code: execution.errorCode ?? null,
            error_message: execution.errorMessage ?? null,
            matched: execution.matched ? 1 : 0,
            status: execution.status,
          }),
        )
        .execute();
    });
  }

  public findUnique(
    companyId: string,
    ruleId: string,
    ruleVersion: number,
    eventId: string,
    contextId: string,
  ): Promise<AutomationExecutionDto | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('automation_executions')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('rule_id', '=', ruleId)
        .where('rule_version', '=', ruleVersion)
        .where('event_id', '=', eventId)
        .where('context_id', '=', contextId)
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

  public list(criteria: AutomationExecutionListCriteria): Promise<readonly AutomationExecutionDto[]> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('automation_executions')
        .selectAll()
        .where('company_id', '=', criteria.companyId);
      if (criteria.ruleId !== undefined) query = query.where('rule_id', '=', criteria.ruleId);
      if (criteria.eventId !== undefined) query = query.where('event_id', '=', criteria.eventId);
      if (criteria.status !== undefined) query = query.where('status', '=', criteria.status);
      return (await query.orderBy('started_at', 'desc').orderBy('id', 'asc').execute()).map(toDto);
    });
  }
}
