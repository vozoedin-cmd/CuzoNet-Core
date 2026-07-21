import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const IPV4_OCTET = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?$/;

/** RouterOS firewall address-list entry address: IPv4 or IPv6, with optional CIDR prefix. */
export class IpAddress {
  private constructor(public readonly value: string) {}

  public static create(raw: string): IpAddress {
    const value = raw.trim();
    if (!IPV4_PATTERN.test(value) && !IPV6_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError(
        'ipAddress',
        'Debe ser una dirección IPv4 o IPv6 válida, con prefijo CIDR opcional.',
      );
    }
    return new IpAddress(value);
  }
}
