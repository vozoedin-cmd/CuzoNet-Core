import type {
  AutomationRuleListCriteria,
  AutomationRuleReader,
} from '../../../../application/ports/automation/automation-rule-reader.port.js';
import type { AutomationRuleRepository } from '../../../../application/ports/automation/automation-rule-repository.port.js';
import type { AutomationRule } from '../../../../domain/automation/automation-rule.js';
import { AutomationRuleConflictError } from '../../../../domain/automation/errors/automation-rule-conflict.error.js';
import type { AutomationEventType } from '../../../../domain/automation/value-objects/event-trigger.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import { sqliteAutomationRuleMapper } from './sqlite-automation-rule.mapper.js';

export class SqliteAutomationRuleRepository
  implements AutomationRuleRepository, AutomationRuleReader
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(rule: AutomationRule): Promise<void> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        const existing = await database
          .selectFrom('automation_rules')
          .select('version')
          .where('company_id', '=', rule.companyId)
          .where('id', '=', rule.id.value)
          .executeTakeFirst();
        if (
          existing !== undefined &&
          rule.version.value !== existing.version &&
          rule.version.value !== existing.version + 1
        )
          throw new AutomationRuleConflictError('La versión persistida de la regla cambió.');

        const actions = sqliteAutomationRuleMapper.serializeActions(rule);
        const condition = sqliteAutomationRuleMapper.serializeCondition(rule);
        await database
          .insertInto('automation_rules')
          .values({
            actions_definition: actions,
            company_id: rule.companyId,
            condition_definition: condition,
            created_at: rule.createdAt.toISOString(),
            created_by: rule.createdBy,
            id: rule.id.value,
            name: rule.name.value,
            priority: rule.priority,
            schema_version: rule.trigger.schemaVersion,
            status: rule.status.value,
            trigger_event_type: rule.trigger.eventType,
            updated_at: rule.updatedAt?.toISOString() ?? null,
            updated_by: rule.updatedBy ?? null,
            version: rule.version.value,
          })
          .onConflict((conflict) =>
            conflict.column('id').doUpdateSet({
              actions_definition: actions,
              condition_definition: condition,
              name: rule.name.value,
              priority: rule.priority,
              status: rule.status.value,
              updated_at: rule.updatedAt?.toISOString() ?? null,
              updated_by: rule.updatedBy ?? null,
              version: rule.version.value,
            }),
          )
          .execute();

        await database
          .insertInto('automation_rule_versions')
          .values({
            actions_definition: actions,
            condition_definition: condition,
            created_at: (rule.updatedAt ?? rule.createdAt).toISOString(),
            created_by: rule.updatedBy ?? rule.createdBy,
            name: rule.name.value,
            priority: rule.priority,
            rule_id: rule.id.value,
            schema_version: rule.trigger.schemaVersion,
            trigger_event_type: rule.trigger.eventType,
            version: rule.version.value,
          })
          .onConflict((conflict) => conflict.columns(['rule_id', 'version']).doNothing())
          .execute();
      }),
    );
  }

  public findById(companyId: string, ruleId: string): Promise<AutomationRule | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('automation_rules')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', ruleId)
        .executeTakeFirst();
      return row === undefined ? null : sqliteAutomationRuleMapper.toDomain(row);
    });
  }

  public list(criteria: AutomationRuleListCriteria): Promise<readonly AutomationRule[]> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('automation_rules')
        .selectAll()
        .where('company_id', '=', criteria.companyId);
      if (criteria.eventType !== undefined)
        query = query.where('trigger_event_type', '=', criteria.eventType);
      if (criteria.status !== undefined) query = query.where('status', '=', criteria.status);
      if (criteria.name !== undefined) query = query.where('name', 'like', `%${criteria.name}%`);
      return (
        await query.orderBy('priority', 'desc').orderBy('name', 'asc').orderBy('id', 'asc').execute()
      ).map(sqliteAutomationRuleMapper.toDomain);
    });
  }

  public listActiveByTrigger(
    companyId: string,
    eventType: AutomationEventType,
    schemaVersion: number,
  ): Promise<readonly AutomationRule[]> {
    return this.session.execute(async (database) =>
      (
        await database
          .selectFrom('automation_rules')
          .selectAll()
          .where('company_id', '=', companyId)
          .where('status', '=', 'active')
          .where('trigger_event_type', '=', eventType)
          .where('schema_version', '=', schemaVersion)
          .orderBy('priority', 'desc')
          .orderBy('id', 'asc')
          .execute()
      ).map(sqliteAutomationRuleMapper.toDomain),
    );
  }
}
