import type { AlertEvaluationStateRepository } from '../../ports/alerting/alert-evaluation-state.repository.js';
import type { MaintenanceWindowProvider } from '../../ports/alerting/maintenance-window.provider.js';
import type { AlertRuleRepository } from '../../ports/alerting/incident-repositories.js';
import type {
  AlertEvaluationInput,
  AlertingBatchEvaluator,
} from '../../ports/monitoring/alert-evaluator.port.js';
import { AlertEvaluationState } from '../../../domain/alerting/alert-evaluation-state.js';
import type { AlertEvaluator } from '../../../domain/alerting/alert-evaluator.js';
import type { AlertRule } from '../../../domain/alerting/alert-rule.js';
import type { Observation } from '../../../domain/monitoring/observation.js';
import type { IncidentEngine } from './incident-engine.js';

export class EvaluateAlertsUseCase implements AlertingBatchEvaluator {
  public constructor(
    private readonly ruleRepository: AlertRuleRepository,
    private readonly evaluationStateRepository: AlertEvaluationStateRepository,
    private readonly evaluator: AlertEvaluator,
    private readonly incidentEngine: IncidentEngine,
    private readonly maintenanceWindowProvider: MaintenanceWindowProvider,
  ) {}

  public async evaluate(input: AlertEvaluationInput): Promise<void> {
    if (input.observations.length === 0) return;
    const rules = await this.ruleRepository.findActiveByCompany(input.companyId);
    const equipmentStates = new Map(
      input.equipmentStates.map((state) => [state.props.equipmentId, state] as const),
    );

    for (const rule of rules) {
      for (const observation of latestRelevantObservations(rule, input.observations).values()) {
        const equipmentState = equipmentStates.get(observation.props.equipmentId);
        if (equipmentState === undefined) continue;
        const observedAt = observation.props.occurredAt;
        const evaluationState =
          (await this.evaluationStateRepository.find(
            input.companyId,
            rule.props.id,
            observation.props.equipmentId,
          )) ??
          AlertEvaluationState.create({
            companyId: input.companyId,
            equipmentId: observation.props.equipmentId,
            ruleId: rule.props.id,
            updatedAt: observedAt,
          });
        const suppressed =
          equipmentState.props.status === 'MAINTENANCE' ||
          (await this.maintenanceWindowProvider.isSuppressed({
            companyId: input.companyId,
            equipmentId: observation.props.equipmentId,
            observedAt,
          }));
        if (suppressed) {
          evaluationState.suppress(observedAt);
          await this.evaluationStateRepository.save(evaluationState);
          continue;
        }

        const currentDecision = this.evaluator.evaluate({ equipmentState, observation, rule });
        const temporalDecision = evaluationState.apply({
          decision: currentDecision,
          durationSeconds: rule.props.durationSeconds,
          observedAt,
          recoveryDurationSeconds: rule.props.recoveryDurationSeconds,
        });
        await this.evaluationStateRepository.save(evaluationState);
        await this.incidentEngine.apply({
          causationId: observation.props.id,
          companyId: input.companyId,
          decision: temporalDecision,
          equipmentId: observation.props.equipmentId,
          observedAt,
          rule,
          value: observation.props.metricValue.value,
        });
      }
    }
  }
}

function latestRelevantObservations(
  rule: AlertRule,
  observations: readonly Observation[],
): ReadonlyMap<string, Observation> {
  const metricType =
    rule.props.condition.type === 'equipment_status'
      ? 'packet_loss'
      : rule.props.condition.metricType;
  const latest = new Map<string, Observation>();
  for (const observation of observations) {
    if (observation.props.metricType !== metricType) continue;
    const previous = latest.get(observation.props.equipmentId);
    if (
      previous === undefined ||
      observation.props.occurredAt > previous.props.occurredAt ||
      (observation.props.occurredAt.getTime() === previous.props.occurredAt.getTime() &&
        observation.props.id > previous.props.id)
    ) {
      latest.set(observation.props.equipmentId, observation);
    }
  }
  return latest;
}
