export interface NetworkLinkEndpointDto {
  id: string;
  side: 'A' | 'B';
  nodeId: string;
  equipmentId: string;
  equipmentInterfaceId?: string;
}

export interface NetworkLinkDto {
  id: string;
  companyId: string;
  linkType: 'ptp_wireless' | 'fiber' | 'ethernet' | 'backhaul';
  name: string;
  capacityKbps?: number;
  status: 'active' | 'inactive' | 'maintenance';
  endpoints: NetworkLinkEndpointDto[];
}
