import type { EquipmentRepository } from '../../domain/inventory/equipment.repository.js';
import { EquipmentNotFoundError } from '../../domain/inventory/errors/equipment-not-found.error.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

export interface SetEquipmentManagementHostCommand {
  companyId: string;
  equipmentId: string;
  managementHost: string | null;
}

export class SetEquipmentManagementHostUseCase {
  public constructor(private readonly repository: EquipmentRepository) {}

  public async execute(command: SetEquipmentManagementHostCommand): Promise<void> {
    const equipment = await this.repository.findById(command.equipmentId);
    if (equipment === null || equipment.props.companyId !== command.companyId) {
      throw new EquipmentNotFoundError();
    }

    equipment.setManagementHost(
      command.managementHost === null ? null : ManagementHost.create(command.managementHost),
    );
    await this.repository.save(equipment);
  }
}
