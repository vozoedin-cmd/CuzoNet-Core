import type { NetworkNodeRepository } from '../../ports/network/network-node.repository.js';
import type { NetworkNodeDto } from '../../dto/network/network-node.dto.js';

export class GetNetworkNodeUseCase {
  constructor(private readonly repository: NetworkNodeRepository) {}

  public async execute(id: string): Promise<NetworkNodeDto | null> {
    const node = await this.repository.findById(id);
    if (!node) return null;

    return {
      id: node.props.id,
      companyId: node.props.companyId,
      code: node.props.code,
      name: node.props.name,
      ...(node.props.addressId ? { addressId: node.props.addressId } : {}),
      ...(node.props.latitude ? { latitude: node.props.latitude } : {}),
      ...(node.props.longitude ? { longitude: node.props.longitude } : {}),
      status: node.props.status,
      towers: node.props.towers.map(t => ({
        id: t.props.id,
        code: t.props.code,
        name: t.props.name,
        heightMeters: t.props.heightMeters,
        status: t.props.status,
        sectors: t.props.sectors.map(s => ({
          id: s.props.id,
          name: s.props.name,
          azimuthDegrees: s.props.azimuthDegrees,
          status: s.props.status,
          equipmentId: s.props.equipmentId,
          ...(s.props.equipmentInterfaceId ? { equipmentInterfaceId: s.props.equipmentInterfaceId } : {})
        }))
      }))
    };
  }
}
