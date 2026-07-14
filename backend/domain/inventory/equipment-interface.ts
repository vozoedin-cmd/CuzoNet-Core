export interface EquipmentInterfaceProps {
  id: string;
  name: string;
  macAddress?: string;
  capacityKbps?: number;
  adminState?: 'up' | 'down';
  operState?: 'up' | 'down' | 'unknown';
  speedMbps?: number;
}

export class EquipmentInterface {
  private constructor(public readonly props: EquipmentInterfaceProps) {}

  public static create(props: EquipmentInterfaceProps): EquipmentInterface {
    return new EquipmentInterface(props);
  }
}
