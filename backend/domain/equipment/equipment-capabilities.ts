export interface EquipmentCapabilitiesProps {
  supportsPppoe: boolean;
  supportsHotspot: boolean;
  maxThroughputMbps?: number;
  [key: string]: unknown;
}

export class EquipmentCapabilities {
  private constructor(public readonly props: EquipmentCapabilitiesProps) {}

  public static create(props: EquipmentCapabilitiesProps): EquipmentCapabilities {
    return new EquipmentCapabilities(props);
  }
}
