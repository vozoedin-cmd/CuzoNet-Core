export interface ResolvedRouterReference {
  equipmentId: string;
  routerId: string;
  equipmentType: string;
  equipmentRole: string;
  locationReference: string;
}

export interface ResolvedRouterReferenceReader {
  findByRouterId(routerId: string): Promise<ResolvedRouterReference | null>;
  findByEquipmentId(equipmentId: string): Promise<ResolvedRouterReference | null>;
}
