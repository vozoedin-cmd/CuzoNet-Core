import { NetworkSector, type NetworkSectorProps } from './network-sector.js';

export interface NetworkTowerProps {
  id: string;
  code: string;
  name: string;
  heightMeters: number;
  status: 'active' | 'inactive' | 'maintenance';
  sectors: NetworkSector[];
}

export class NetworkTower {
  private constructor(public readonly props: NetworkTowerProps) {}

  public static create(props: NetworkTowerProps): NetworkTower {
    if (props.heightMeters < 0) {
      throw new Error('Tower height cannot be negative');
    }
    return new NetworkTower({ ...props });
  }

  public addSector(props: NetworkSectorProps): void {
    const existing = this.props.sectors.find(s => s.props.name === props.name || s.props.equipmentId === props.equipmentId);
    if (existing) {
      throw new Error('Sector name or equipment already exists on this tower');
    }
    this.props.sectors.push(NetworkSector.create(props));
  }
}
