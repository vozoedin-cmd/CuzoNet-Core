import { InvalidProvisioningDataError } from '../errors/invalid-provisioning-data.error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProvisionRequestProps {
  ipAddressId?: string;
  routerId: string;
  serviceAddressId?: string;
}

export class ProvisionRequest {
  private constructor(
    private readonly props: Required<Pick<ProvisionRequestProps, 'routerId'>> &
      Omit<ProvisionRequestProps, 'routerId'>,
  ) {}

  public static create(props: ProvisionRequestProps): ProvisionRequest {
    for (const [path, value] of Object.entries(props)) {
      if (value !== undefined && !UUID_PATTERN.test(value)) {
        throw new InvalidProvisioningDataError(path, 'Debe ser un UUID válido.');
      }
    }
    return new ProvisionRequest({
      routerId: props.routerId.toLowerCase(),
      ...(props.ipAddressId === undefined ? {} : { ipAddressId: props.ipAddressId.toLowerCase() }),
      ...(props.serviceAddressId === undefined
        ? {}
        : { serviceAddressId: props.serviceAddressId.toLowerCase() }),
    });
  }

  public get routerId(): string {
    return this.props.routerId;
  }
  public get ipAddressId(): string | undefined {
    return this.props.ipAddressId;
  }
  public get serviceAddressId(): string | undefined {
    return this.props.serviceAddressId;
  }
}
