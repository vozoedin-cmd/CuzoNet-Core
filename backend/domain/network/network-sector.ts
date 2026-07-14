export interface NetworkSectorProps {
  id: string;
  name: string;
  azimuthDegrees: number;
  status: 'active' | 'inactive' | 'maintenance';
  equipmentId: string;
  equipmentInterfaceId?: string;
}

export class NetworkSector {
  private constructor(public readonly props: NetworkSectorProps) {}

  public static create(props: NetworkSectorProps): NetworkSector {
    if (props.azimuthDegrees < 0 || props.azimuthDegrees > 360) {
      throw new Error('Azimuth must be between 0 and 360 degrees');
    }
    return new NetworkSector({ ...props });
  }
}
