import type { Equipment } from './equipment.js';

export interface EquipmentRepository {
  findById(id: string): Promise<Equipment | null>;
  save(equipment: Equipment): Promise<void>;
}
