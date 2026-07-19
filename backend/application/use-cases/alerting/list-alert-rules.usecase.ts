import type { AlertRuleRepository } from '../../ports/alerting/incident-repositories.js';
import type { AlertRule } from '../../../domain/alerting/alert-rule.js';

export class ListAlertRulesUseCase {
  public constructor(private readonly repository: AlertRuleRepository) {}

  public execute(companyId: string): Promise<AlertRule[]> {
    return this.repository.listByCompany(companyId);
  }
}
