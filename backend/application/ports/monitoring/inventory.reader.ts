export interface InventoryEquipmentReference {
  id: string;
  companyId: string;
  type: string;
  role: string;
  capabilities: Readonly<Record<string, unknown>>;
  status: 'active' | 'inactive' | 'retired';
}

export interface InventoryReader {
  findEquipmentById(equipmentId: string): Promise<InventoryEquipmentReference | null>;
  listEquipment(): Promise<InventoryEquipmentReference[]>;
}
