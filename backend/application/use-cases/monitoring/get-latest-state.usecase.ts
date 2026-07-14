import type { EquipmentStateRepository } from '../../ports/monitoring/equipment-state.repository.js';
import type { EquipmentStateDto } from '../../dto/monitoring/observation.dto.js';
import type { InventoryReader } from '../../ports/monitoring/inventory.reader.js';

export class GetLatestStateUseCase {
  constructor(
    private readonly stateRepo: EquipmentStateRepository,
    private readonly inventoryReader: InventoryReader
  ) {}

  public async execute(companyId: string, equipmentId: string): Promise<EquipmentStateDto | null> {
    const eqRef = await this.inventoryReader.findEquipmentById(equipmentId);
    if (!eqRef || eqRef.companyId !== companyId) {
      return null;
    }

    const state = await this.stateRepo.findById(equipmentId);
    if (!state) return null;

    return {
      equipmentId: state.props.equipmentId,
      status: state.props.status,
      ...(state.props.lastSeenAt ? { lastSeenAt: state.props.lastSeenAt } : {}),
      ...(state.props.lastLatencyMs !== undefined ? { lastLatencyMs: state.props.lastLatencyMs } : {}),
      ...(state.props.uptimeSeconds !== undefined ? { uptimeSeconds: state.props.uptimeSeconds } : {})
    };
  }
}
