import { NetworkNode } from '../../../domain/network/network-node.js';
import type { NetworkNodeRepository } from '../../ports/network/network-node.repository.js';
import type { InventoryEquipmentReader } from '../../ports/network/inventory-equipment.reader.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export interface CreateNetworkNodeCommand {
  companyId: string;
  code: string;
  name: string;
  addressId?: string;
  latitude?: number;
  longitude?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  towers?: {
    code: string;
    name: string;
    heightMeters: number;
    status?: 'active' | 'inactive' | 'maintenance';
    sectors?: {
      name: string;
      azimuthDegrees: number;
      status?: 'active' | 'inactive' | 'maintenance';
      equipmentId: string;
      equipmentInterfaceId?: string;
    }[];
  }[];
}

export class CreateNetworkNodeUseCase {
  constructor(
    private readonly nodeRepository: NetworkNodeRepository,
    private readonly inventoryReader: InventoryEquipmentReader,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(command: CreateNetworkNodeCommand): Promise<string> {
    const node = NetworkNode.create({
      id: this.idGenerator.generate(),
      companyId: command.companyId,
      code: command.code,
      name: command.name,
      ...(command.addressId ? { addressId: command.addressId } : {}),
      ...(command.latitude ? { latitude: command.latitude } : {}),
      ...(command.longitude ? { longitude: command.longitude } : {}),
      status: command.status || 'active',
      towers: []
    });

    if (command.towers) {
      for (const t of command.towers) {
        const towerId = this.idGenerator.generate();
        node.addTower({
          id: towerId,
          code: t.code,
          name: t.name,
          heightMeters: t.heightMeters,
          status: t.status || 'active',
          sectors: []
        });

        const tower = node.props.towers.find(tw => tw.props.id === towerId)!;

        if (t.sectors) {
          for (const s of t.sectors) {
            // Validate equipment
            const equipment = await this.inventoryReader.findEquipmentById(s.equipmentId);
            if (!equipment || equipment.companyId !== command.companyId) {
              throw new Error(`Equipment ${s.equipmentId} not found or belongs to another company`);
            }
            if (s.equipmentInterfaceId) {
              const iface = await this.inventoryReader.findInterfaceById(s.equipmentInterfaceId);
              if (!iface || iface.equipmentId !== s.equipmentId) {
                throw new Error(`Interface ${s.equipmentInterfaceId} not found or doesn't belong to equipment ${s.equipmentId}`);
              }
            }

            tower.addSector({
              id: this.idGenerator.generate(),
              name: s.name,
              azimuthDegrees: s.azimuthDegrees,
              status: s.status || 'active',
              equipmentId: s.equipmentId,
              ...(s.equipmentInterfaceId ? { equipmentInterfaceId: s.equipmentInterfaceId } : {})
            });
          }
        }
      }
    }

    await this.nodeRepository.save(node);
    return node.props.id;
  }
}
