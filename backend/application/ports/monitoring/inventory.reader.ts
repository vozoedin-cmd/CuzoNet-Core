export interface InventoryEquipmentReference {
  id: string;
  companyId: string;
}

export interface InventoryReader {
  findEquipmentById(equipmentId: string): Promise<InventoryEquipmentReference | null>;
}
