import { NetworkLink, type LinkType } from '../../../domain/network/network-link.js';
import { NetworkLinkEndpoint } from '../../../domain/network/network-link-endpoint.js';
import type { NetworkLinkRepository } from '../../ports/network/network-link.repository.js';
import type { NetworkNodeRepository } from '../../ports/network/network-node.repository.js';
import type { InventoryEquipmentReader } from '../../ports/network/inventory-equipment.reader.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export interface CreateNetworkLinkCommand {
  companyId: string;
  linkType: LinkType;
  name: string;
  capacityKbps?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  endpoints: {
    side: 'A' | 'B';
    nodeId: string;
    equipmentId: string;
    equipmentInterfaceId?: string;
  }[];
}

export class CreateNetworkLinkUseCase {
  constructor(
    private readonly linkRepository: NetworkLinkRepository,
    private readonly nodeRepository: NetworkNodeRepository,
    private readonly inventoryReader: InventoryEquipmentReader,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(command: CreateNetworkLinkCommand): Promise<string> {
    if (!command.endpoints || command.endpoints.length !== 2) {
      throw new Error('Link must have exactly two endpoints');
    }

    const createdEndpoints = [];
    for (const ep of command.endpoints) {
      // Validate node
      const node = await this.nodeRepository.findById(ep.nodeId);
      if (!node || node.props.companyId !== command.companyId) {
        throw new Error(`Node ${ep.nodeId} not found or belongs to another company`);
      }

      // Validate equipment
      const equipment = await this.inventoryReader.findEquipmentById(ep.equipmentId);
      if (!equipment || equipment.companyId !== command.companyId) {
        throw new Error(`Equipment ${ep.equipmentId} not found or belongs to another company`);
      }
      
      if (ep.equipmentInterfaceId) {
        const iface = await this.inventoryReader.findInterfaceById(ep.equipmentInterfaceId);
        if (!iface || iface.equipmentId !== ep.equipmentId) {
          throw new Error(`Interface ${ep.equipmentInterfaceId} not found or doesn't belong to equipment ${ep.equipmentId}`);
        }
      }

      createdEndpoints.push(NetworkLinkEndpoint.create({
        id: this.idGenerator.generate(),
        side: ep.side,
        nodeId: ep.nodeId,
        equipmentId: ep.equipmentId,
        ...(ep.equipmentInterfaceId ? { equipmentInterfaceId: ep.equipmentInterfaceId } : {})
      }));
    }

    const link = NetworkLink.create({
      id: this.idGenerator.generate(),
      companyId: command.companyId,
      linkType: command.linkType,
      name: command.name,
      ...(command.capacityKbps ? { capacityKbps: command.capacityKbps } : {}),
      status: command.status || 'active',
      endpoints: createdEndpoints
    });

    await this.linkRepository.save(link);
    return link.props.id;
  }
}
