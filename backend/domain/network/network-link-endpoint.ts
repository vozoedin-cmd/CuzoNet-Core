export interface NetworkLinkEndpointProps {
  id: string;
  side: 'A' | 'B';
  nodeId: string;
  equipmentId: string;
  equipmentInterfaceId?: string;
}

export class NetworkLinkEndpoint {
  private constructor(public readonly props: NetworkLinkEndpointProps) {}

  public static create(props: NetworkLinkEndpointProps): NetworkLinkEndpoint {
    return new NetworkLinkEndpoint({ ...props });
  }
}
