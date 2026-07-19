import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { AlertingBatchEvaluator } from '../../ports/monitoring/alert-evaluator.port.js';
import type { EquipmentStateRepository } from '../../ports/monitoring/equipment-state.repository.js';
import type { InventoryReader } from '../../ports/monitoring/inventory.reader.js';
import type { ObservationRepository } from '../../ports/monitoring/observation.repository.js';
import { EquipmentState } from '../../../domain/monitoring/equipment-state.js';
import type { MetricUnit } from '../../../domain/monitoring/metric-value.js';
import { Observation } from '../../../domain/monitoring/observation.js';

export interface RecordObservationCommand {
  equipmentId: string;
  metricType: string;
  value: number;
  unit: MetricUnit;
  timestamp: Date;
  source: string;
}

export interface MonitoringAlertingLogger {
  error(input: Readonly<Record<string, unknown>>): void;
}

const noOpLogger: MonitoringAlertingLogger = { error: () => undefined };

export class RecordObservationBatchUseCase {
  public constructor(
    private readonly observationRepo: ObservationRepository,
    private readonly stateRepo: EquipmentStateRepository,
    private readonly inventoryReader: InventoryReader,
    private readonly idGenerator: IdGenerator,
    private readonly alertEvaluator?: AlertingBatchEvaluator,
    private readonly logger: MonitoringAlertingLogger = noOpLogger,
  ) {}

  public async execute(companyId: string, commands: RecordObservationCommand[]): Promise<void> {
    if (commands.length === 0) return;
    const validObservations: Observation[] = [];
    const equipmentStates: EquipmentState[] = [];
    const equipmentMap = new Map<string, RecordObservationCommand[]>();
    for (const command of commands) {
      const equipmentCommands = equipmentMap.get(command.equipmentId) ?? [];
      equipmentCommands.push(command);
      equipmentMap.set(command.equipmentId, equipmentCommands);
    }

    for (const [equipmentId, equipmentCommands] of equipmentMap) {
      const equipment = await this.inventoryReader.findEquipmentById(equipmentId);
      if (equipment === null || equipment.companyId !== companyId) continue;
      const observations = equipmentCommands.map((command) =>
        Observation.create({
          equipmentId: command.equipmentId,
          id: this.idGenerator.generate(),
          metricType: command.metricType,
          occurredAt: command.timestamp,
          source: command.source,
          unit: command.unit,
          value: command.value,
        }),
      );
      const state =
        (await this.stateRepo.findById(equipmentId)) ??
        EquipmentState.create({ equipmentId, status: 'UNKNOWN' });
      state.applyObservations(observations);
      equipmentStates.push(state);
      validObservations.push(...observations);
    }

    if (validObservations.length === 0) return;
    await this.observationRepo.saveBatch(validObservations);
    for (const state of equipmentStates) await this.stateRepo.save(state);

    try {
      await this.alertEvaluator?.evaluate({
        companyId,
        equipmentStates,
        observations: validObservations,
      });
    } catch (error) {
      this.logger.error({
        action: 'monitoring.alerting.failed',
        companyId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        module: 'monitoring',
      });
    }
  }
}
