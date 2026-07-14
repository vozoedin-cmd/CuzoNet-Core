export interface NetworkReader {
  findEquipmentIdsByNode(nodeId: string): Promise<string[]>;
  findEquipmentIdsByLink(linkId: string): Promise<string[]>;
}
