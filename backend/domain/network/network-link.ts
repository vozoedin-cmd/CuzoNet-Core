import type { NetworkLinkEndpoint } from './network-link-endpoint.js';

export type LinkType = 'ptp_wireless' | 'fiber' | 'ethernet' | 'backhaul';

export interface NetworkLinkProps {
  id: string;
  companyId: string;
  linkType: LinkType;
  name: string;
  capacityKbps?: number;
  status: 'active' | 'inactive' | 'maintenance';
  endpoints: NetworkLinkEndpoint[];
}

export class NetworkLink {
  private constructor(public readonly props: NetworkLinkProps) {}

  public static create(props: NetworkLinkProps): NetworkLink {
    if (props.endpoints.length !== 2) {
      throw new Error('A network link must have exactly two endpoints');
    }
    
    const sideA = props.endpoints.find(e => e.props.side === 'A');
    const sideB = props.endpoints.find(e => e.props.side === 'B');
    if (!sideA || !sideB) {
      throw new Error('A network link must have exactly one side A and one side B');
    }

    if (sideA.props.nodeId === sideB.props.nodeId) {
      throw new Error('Link endpoints must belong to different nodes');
    }

    if (sideA.props.equipmentId === sideB.props.equipmentId) {
      throw new Error('Link endpoints must use different equipment');
    }

    // Checking if same interface is used is redundant if they use different equipment, 
    // but good for completeness if they were (incorrectly) the same equipment.

    return new NetworkLink({ ...props });
  }
}
