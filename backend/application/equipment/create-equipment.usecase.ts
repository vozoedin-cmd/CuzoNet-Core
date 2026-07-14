import type { EquipmentRepository } from '../../domain/equipment/equipment.repository.js';
import { Equipment } from '../../domain/equipment/equipment.js';
import { EquipmentRole } from '../../domain/equipment/equipment-role.js';
import { EquipmentType } from '../../domain/equipment/equipment-type.js';
import { EquipmentCapabilities, type EquipmentCapabilitiesProps } from '../../domain/equipment/equipment-capabilities.js';
import type { IdGenerator } from '../ports/id-generator.port.js';

export interface CreateEquipmentCommand {
  companyId: string;
  type: string;
  role: string;
  capabilities: unknown;
  serialNumber?: string;
  macAddress?: string;
}

export class CreateEquipmentUseCase {
  constructor(
    private readonly repository: EquipmentRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(command: CreateEquipmentCommand): Promise<string> {
    const equipment = Equipment.create({
      id: this.idGenerator.generate(),
      companyId: command.companyId,
      type: EquipmentType.create(command.type),
      role: EquipmentRole.create(command.role),
      capabilities: EquipmentCapabilities.create(command.capabilities as EquipmentCapabilitiesProps),
      status: 'active',
      acquiredOn: new Date(),
      interfaces: [],
      assignments: [],
      ...(command.serialNumber !== undefined ? { serialNumber: command.serialNumber } : {}),
      ...(command.macAddress !== undefined ? { macAddress: command.macAddress } : {})
    });

    await this.repository.save(equipment);
    return equipment.id;
  }
}
