import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { AlertRuleRepository } from '../../ports/alerting/incident-repositories.js';
import {
  createDefaultAlertRule,
  defaultAlertRuleDefinitions,
} from '../../../domain/alerting/default-alert-rules.js';

export class InstallDefaultAlertRulesUseCase {
  public constructor(
    private readonly repository: AlertRuleRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(companyId: string): Promise<void> {
    for (const definition of defaultAlertRuleDefinitions) {
      if ((await this.repository.findByCode(companyId, definition.code)) !== null) continue;
      const now = this.clock.now();
      await this.repository.save(
        createDefaultAlertRule(companyId, definition, this.idGenerator.generate(), now),
      );
    }
  }
}
