export interface InventoryEquipmentReference {
  id: string;
  companyId: string;
  status: string;
}

export interface InventoryEquipmentInterfaceReference {
  id: string;
  equipmentId: string;
}

export interface InventoryEquipmentReader {
  findEquipmentById(id: string): Promise<InventoryEquipmentReference | null>;
  findInterfaceById(id: string): Promise<InventoryEquipmentInterfaceReference | null>;
}
