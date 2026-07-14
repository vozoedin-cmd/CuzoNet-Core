import type { NetworkNode } from '../../../domain/network/network-node.js';

export interface NetworkNodeRepository {
  findById(id: string): Promise<NetworkNode | null>;
  save(node: NetworkNode): Promise<void>;
  listByCompanyId(companyId: string): Promise<NetworkNode[]>;
}
