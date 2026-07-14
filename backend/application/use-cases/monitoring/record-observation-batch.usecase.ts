import { Observation } from '../../../domain/monitoring/observation.js';
import { EquipmentState } from '../../../domain/monitoring/equipment-state.js';
import type { ObservationRepository } from '../../ports/monitoring/observation.repository.js';
import type { EquipmentStateRepository } from '../../ports/monitoring/equipment-state.repository.js';
import type { InventoryReader } from '../../ports/monitoring/inventory.reader.js';
import type { MetricUnit } from '../../../domain/monitoring/metric-value.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export interface RecordObservationCommand {
  equipmentId: string;
  metricType: string;
  value: number;
  unit: MetricUnit;
  timestamp: Date;
  source: string;
}

export class RecordObservationBatchUseCase {
  constructor(
    private readonly observationRepo: ObservationRepository,
    private readonly stateRepo: EquipmentStateRepository,
    private readonly inventoryReader: InventoryReader,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(companyId: string, commands: RecordObservationCommand[]): Promise<void> {
    if (commands.length === 0) return;

    const validObservations: Observation[] = [];
    
    // Group by equipmentId to minimize inventory reads and state reads
    const equipmentMap = new Map<string, RecordObservationCommand[]>();
    for (const cmd of commands) {
      if (!equipmentMap.has(cmd.equipmentId)) {
        equipmentMap.set(cmd.equipmentId, []);
      }
      equipmentMap.get(cmd.equipmentId)!.push(cmd);
    }

    for (const [eqId, eqCommands] of equipmentMap.entries()) {
      const eqRef = await this.inventoryReader.findEquipmentById(eqId);
      if (!eqRef || eqRef.companyId !== companyId) {
        // Skip metrics for unknown equipment or wrong company
        continue;
      }

      const eqObservations: Observation[] = [];
      for (const cmd of eqCommands) {
        eqObservations.push(Observation.create({
          id: this.idGenerator.generate(),
          equipmentId: cmd.equipmentId,
          metricType: cmd.metricType,
          value: cmd.value,
          unit: cmd.unit,
          occurredAt: cmd.timestamp,
          source: cmd.source
        }));
      }

      let state = await this.stateRepo.findById(eqId);
      if (!state) {
        state = EquipmentState.create({
          equipmentId: eqId,
          status: 'UNKNOWN'
        });
      }

      state.applyObservations(eqObservations);
      
      await this.stateRepo.save(state);
      validObservations.push(...eqObservations);
    }

    if (validObservations.length > 0) {
      await this.observationRepo.saveBatch(validObservations);
    }
  }
}
