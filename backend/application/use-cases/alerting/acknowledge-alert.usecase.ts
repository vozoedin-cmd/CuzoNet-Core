
import type { AlertRepository } from '../../ports/alerting/repositories.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export class AcknowledgeAlertUseCase {
  constructor(
    private readonly alertRepo: AlertRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(alertId: string, actorId: string): Promise<void> {
    const alert = await this.alertRepo.findById(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.acknowledge(actorId, this.idGenerator.generate());
    await this.alertRepo.save(alert);
  }
}
