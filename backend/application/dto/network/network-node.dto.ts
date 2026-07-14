export interface NetworkSectorDto {
  id: string;
  name: string;
  azimuthDegrees: number;
  status: 'active' | 'inactive' | 'maintenance';
  equipmentId: string;
  equipmentInterfaceId?: string;
}

export interface NetworkTowerDto {
  id: string;
  code: string;
  name: string;
  heightMeters: number;
  status: 'active' | 'inactive' | 'maintenance';
  sectors: NetworkSectorDto[];
}

export interface NetworkNodeDto {
  id: string;
  companyId: string;
  code: string;
  name: string;
  addressId?: string;
  latitude?: number;
  longitude?: number;
  status: 'active' | 'inactive' | 'maintenance';
  towers: NetworkTowerDto[];
}
