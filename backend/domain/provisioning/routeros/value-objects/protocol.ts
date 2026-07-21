import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const KNOWN_PROTOCOLS = new Set([
  'tcp',
  'udp',
  'icmp',
  'icmpv6',
  'gre',
  'ipsec-esp',
  'ipsec-ah',
  'ospf',
  'igmp',
  'vrrp',
  'sctp',
  'ipencap',
]);
const NUMERIC_PROTOCOL = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;

/** RouterOS firewall filter protocol: a known keyword (tcp, udp, ...) or a numeric IP protocol id (0-255). */
export class Protocol {
  private constructor(public readonly value: string) {}

  public static create(raw: string): Protocol {
    const value = raw.trim().toLowerCase();
    if (!KNOWN_PROTOCOLS.has(value) && !NUMERIC_PROTOCOL.test(value)) {
      throw new InvalidProvisioningDataError(
        'protocol',
        'Debe ser un protocolo RouterOS conocido (tcp, udp, icmp, ...) o un número de protocolo IP (0-255).',
      );
    }
    return new Protocol(value);
  }
}
