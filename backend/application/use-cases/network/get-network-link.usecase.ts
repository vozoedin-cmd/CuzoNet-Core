import type { NetworkLinkRepository } from '../../ports/network/network-link.repository.js';
import type { NetworkLinkDto } from '../../dto/network/network-link.dto.js';

export class GetNetworkLinkUseCase {
  constructor(private readonly repository: NetworkLinkRepository) {}

  public async execute(id: string): Promise<NetworkLinkDto | null> {
    const link = await this.repository.findById(id);
    if (!link) return null;

    return {
      id: link.props.id,
      companyId: link.props.companyId,
      linkType: link.props.linkType,
      name: link.props.name,
      ...(link.props.capacityKbps ? { capacityKbps: link.props.capacityKbps } : {}),
      status: link.props.status,
      endpoints: link.props.endpoints.map(e => ({
        id: e.props.id,
        side: e.props.side,
        nodeId: e.props.nodeId,
        equipmentId: e.props.equipmentId,
        ...(e.props.equipmentInterfaceId ? { equipmentInterfaceId: e.props.equipmentInterfaceId } : {})
      }))
    };
  }
}
