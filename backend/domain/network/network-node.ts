import { NetworkTower, type NetworkTowerProps } from './network-tower.js';

export interface NetworkNodeProps {
  id: string;
  companyId: string;
  code: string;
  name: string;
  addressId?: string;
  latitude?: number;
  longitude?: number;
  status: 'active' | 'inactive' | 'maintenance';
  towers: NetworkTower[];
}

export class NetworkNode {
  private constructor(public readonly props: NetworkNodeProps) {}

  public static create(props: NetworkNodeProps): NetworkNode {
    return new NetworkNode({ ...props });
  }

  public addTower(props: NetworkTowerProps): void {
    const existing = this.props.towers.find(t => t.props.code === props.code);
    if (existing) {
      throw new Error('Tower code already exists on this node');
    }
    this.props.towers.push(NetworkTower.create(props));
  }
}
