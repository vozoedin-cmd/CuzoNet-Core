
import type { AlertRepository } from '../../ports/alerting/repositories.js';
import type { AlertEventPublisher } from '../../ports/alerting/publisher.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export class ResolveAlertUseCase {
  constructor(
    private readonly alertRepo: AlertRepository,
    private readonly publisher: AlertEventPublisher,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(alertId: string, actorId?: string): Promise<void> {
    const alert = await this.alertRepo.findById(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    const wasActive = alert.props.status !== 'RESOLVED';
    
    alert.resolve(actorId, this.idGenerator.generate());
    await this.alertRepo.save(alert);

    if (wasActive) {
      await this.publisher.publishAlertResolved(alert.props.companyId, alert.props.id, alert.props.entityId);
    }
  }
}
