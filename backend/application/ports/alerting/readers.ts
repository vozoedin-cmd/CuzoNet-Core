
// Simplified interfaces for integration with other modules
export interface MonitoringAlertReader {
  // Returns equipment IDs that are DOWN
  getDownEquipments(companyId: string): Promise<string[]>;
}

export interface NetworkAlertReader {
  // Check if a node is down, which might suppress sector alerts
  isNodeDown(nodeId: string): Promise<boolean>;
}

export interface InventoryAlertReader {
  // Check if equipment belongs to the company
  checkEquipmentExists(companyId: string, equipmentId: string): Promise<boolean>;
}
