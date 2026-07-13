import type {
  AutomationRuleListCriteria,
  AutomationRuleReader,
} from '../../../../application/ports/automation/automation-rule-reader.port.js';
import type { AutomationRuleRepository } from '../../../../application/ports/automation/automation-rule-repository.port.js';
import type { AutomationRule } from '../../../../domain/automation/automation-rule.js';
import type { AutomationEventType } from '../../../../domain/automation/value-objects/event-trigger.js';
import {
  inMemoryAutomationRuleMapper,
  type AutomationRuleRecord,
} from './in-memory-automation-rule.mapper.js';
export class InMemoryAutomationRuleRepository
  implements AutomationRuleRepository, AutomationRuleReader
{
  private readonly current = new Map<string, AutomationRuleRecord>();
  private readonly versions = new Map<string, AutomationRuleRecord>();
  public save(rule: AutomationRule): Promise<void> {
    const record = inMemoryAutomationRuleMapper.toRecord(rule);
    this.current.set(`${rule.companyId}:${rule.id.value}`, record);
    this.versions.set(`${rule.companyId}:${rule.id.value}:${rule.version.value}`, record);
    return Promise.resolve();
  }
  public findById(companyId: string, ruleId: string): Promise<AutomationRule | null> {
    const record = this.current.get(`${companyId}:${ruleId}`);
    return Promise.resolve(
      record === undefined ? null : inMemoryAutomationRuleMapper.toDomain(record),
    );
  }
  public list(criteria: AutomationRuleListCriteria): Promise<readonly AutomationRule[]> {
    return Promise.resolve(
      [...this.current.values()]
        .filter(
          (record) =>
            record.companyId === criteria.companyId &&
            (criteria.eventType === undefined || record.eventType === criteria.eventType) &&
            (criteria.status === undefined || record.status === criteria.status) &&
            (criteria.name === undefined ||
              record.name.toLowerCase().includes(criteria.name.toLowerCase())),
        )
        .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
        .map(inMemoryAutomationRuleMapper.toDomain),
    );
  }
  public listActiveByTrigger(
    companyId: string,
    eventType: AutomationEventType,
    schemaVersion: number,
  ): Promise<readonly AutomationRule[]> {
    return Promise.resolve(
      [...this.current.values()]
        .filter(
          (record) =>
            record.companyId === companyId &&
            record.status === 'active' &&
            record.eventType === eventType &&
            record.schemaVersion === schemaVersion,
        )
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
        .map(inMemoryAutomationRuleMapper.toDomain),
    );
  }
}
