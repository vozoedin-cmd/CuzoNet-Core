
import type { AlertPolicyRepository, AlertRepository } from '../../ports/alerting/repositories.js';
import type { MonitoringAlertReader } from '../../ports/alerting/readers.js';
import type { AlertEventPublisher } from '../../ports/alerting/publisher.js';
import { Alert } from '../../../domain/alerting/alert.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export class EvaluateAlertPoliciesUseCase {
  constructor(
    private readonly policyRepo: AlertPolicyRepository,
    private readonly alertRepo: AlertRepository,
    private readonly monitoringReader: MonitoringAlertReader,
    private readonly publisher: AlertEventPublisher,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(companyId: string): Promise<void> {
    const activePolicies = await this.policyRepo.findAllActive(companyId);
    if (activePolicies.length === 0) return;

    // For simplicity, we only evaluate a specific hardcoded rule condition for DOWN equipments 
    // to simulate the logic without building a full rules engine.
    const networkPolicies = activePolicies.filter(p => p.props.category === 'NETWORK' && p.props.condition.operator === 'DOWN');
    
    if (networkPolicies.length > 0) {
      const downEquipmentIds = await this.monitoringReader.getDownEquipments(companyId);

      for (const policy of networkPolicies) {
        for (const eqId of downEquipmentIds) {
          // Check if alert already exists
          const existingAlert = await this.alertRepo.findByEntityAndPolicy(eqId, policy.props.id, true);
          if (!existingAlert) {
            const newAlert = Alert.create({
              id: this.idGenerator.generate(),
              companyId,
              policyId: policy.props.id,
              entityType: 'equipment',
              entityId: eqId,
              severity: policy.props.severity
            });
            await this.alertRepo.save(newAlert);
            await this.publisher.publishAlertTriggered(companyId, newAlert.props.id, eqId);
          }
        }
      }
    }
  }
}
