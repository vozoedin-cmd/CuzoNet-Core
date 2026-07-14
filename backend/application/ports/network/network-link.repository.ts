import type { NetworkLink } from '../../../domain/network/network-link.js';

export interface NetworkLinkRepository {
  findById(id: string): Promise<NetworkLink | null>;
  save(link: NetworkLink): Promise<void>;
  listByCompanyId(companyId: string): Promise<NetworkLink[]>;
}
