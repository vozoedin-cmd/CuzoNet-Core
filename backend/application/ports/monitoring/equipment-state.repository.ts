import type { EquipmentState } from '../../../domain/monitoring/equipment-state.js';

export interface EquipmentStateRepository {
  findById(equipmentId: string): Promise<EquipmentState | null>;
  save(state: EquipmentState): Promise<void>;
}
