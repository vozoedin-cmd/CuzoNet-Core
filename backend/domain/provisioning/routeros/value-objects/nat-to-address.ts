import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const IPV4_OCTET = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const IPV4_PLAIN = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);
const IPV4_CIDR = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?$/;

/**
 * RouterOS firewall NAT to-addresses: the translation target for
 * dst-nat/src-nat/netmap. Either a single IPv4/IPv6 address (with optional
 * CIDR for netmap's network mapping) or an IPv4 range "start-end" (used by
 * netmap/dst-nat for 1:1 or load-balanced mappings). IPv6 ranges are out of
 * scope.
 */
export class NatToAddress {
  private constructor(public readonly value: string) {}

  public static create(raw: string): NatToAddress {
    const value = raw.trim();
    if (value.includes('-')) {
      const parts = value.split('-');
      if (parts.length !== 2 || !IPV4_PLAIN.test(parts[0]!) || !IPV4_PLAIN.test(parts[1]!)) {
        throw new InvalidProvisioningDataError(
          'toAddresses',
          'Un rango debe ser dos direcciones IPv4 separadas por "-" (p.ej. "192.168.1.10-192.168.1.20").',
        );
      }
      return new NatToAddress(value);
    }
    if (!IPV4_CIDR.test(value) && !IPV6_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError(
        'toAddresses',
        'Debe ser una dirección IPv4/IPv6 válida (con CIDR opcional) o un rango IPv4 "inicio-fin".',
      );
    }
    return new NatToAddress(value);
  }
}
