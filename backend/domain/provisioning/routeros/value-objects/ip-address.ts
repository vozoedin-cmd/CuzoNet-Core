import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const IPV4_OCTET = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const IPV4 = `${IPV4_OCTET}(\\.${IPV4_OCTET}){3}`;
const IPV4_PATTERN = new RegExp(`^${IPV4}(\\/(3[0-2]|[12]?[0-9]))?$`);
/** Extremos de un rango: IPv4 planas, sin prefijo CIDR. */
const IPV4_ENDPOINT_PATTERN = new RegExp(`^${IPV4}$`);

const OCTETS_PER_IPV4 = 4;
const VALUES_PER_OCTET = 256;

const SUPPORTED_FORMS =
  'Debe ser una dirección IPv4, una red IPv4 con prefijo CIDR o un rango IPv4 (p. ej. "203.0.113.10-203.0.113.15").';

/**
 * Dirección de una entrada de `/ip/firewall/address-list`, que es la tabla **IPv4**.
 *
 * Formatos aceptados, verificados contra un hEX con RouterOS 7.21.4:
 * - IPv4 (`203.0.113.1`) y red IPv4 con CIDR (`10.0.0.0/24`).
 * - Rango IPv4 (`203.0.113.10-203.0.113.15`). RouterOS lo acepta y `/print` lo devuelve
 *   literal, sin normalizar, como una única entrada estática.
 *
 * Formatos rechazados a propósito:
 * - **IPv6**: pertenece a `/ipv6/firewall/address-list`, un recurso distinto que CuzoNet
 *   no implementa. Enviada aquí, RouterOS responde `is not a valid dns name`, porque todo
 *   lo que no reconoce como IPv4 lo interpreta como nombre de dominio.
 * - **Nombres de dominio**: RouterOS los acepta, los resuelve y crea entradas *hijas
 *   dinámicas* (una por IP resuelta) cuyo comentario sobrescribe con el nombre del padre.
 *   Un solo `add` de `example.com` produjo tres filas en el laboratorio. Ese estado no es
 *   representable en el modelo de estado deseado, así que queda fuera del contrato.
 */
export class IpAddress {
  private constructor(public readonly value: string) {}

  public static create(raw: string): IpAddress {
    const value = raw.trim();

    const separator = value.indexOf('-');
    if (separator > 0) {
      return IpAddress.createRange(value, value.slice(0, separator), value.slice(separator + 1));
    }

    if (!IPV4_PATTERN.test(value)) {
      throw new InvalidProvisioningDataError('ipAddress', IpAddress.rejectionMessage(value));
    }
    return new IpAddress(value);
  }

  private static createRange(value: string, start: string, end: string): IpAddress {
    if (!IPV4_ENDPOINT_PATTERN.test(start) || !IPV4_ENDPOINT_PATTERN.test(end)) {
      throw new InvalidProvisioningDataError(
        'ipAddress',
        `Los extremos de un rango deben ser direcciones IPv4 sin prefijo CIDR. ${SUPPORTED_FORMS}`,
      );
    }
    if (IpAddress.toNumber(start) > IpAddress.toNumber(end)) {
      throw new InvalidProvisioningDataError(
        'ipAddress',
        'El inicio de un rango IPv4 no puede ser mayor que su final.',
      );
    }
    return new IpAddress(value);
  }

  /** Mensaje específico para IPv6, que de otro modo recibiría un error de RouterOS sobre DNS. */
  private static rejectionMessage(value: string): string {
    if (value.includes(':')) {
      return `Las direcciones IPv6 no se admiten en /ip/firewall/address-list, que es la tabla IPv4. ${SUPPORTED_FORMS}`;
    }
    return `${SUPPORTED_FORMS} No se aceptan nombres de dominio.`;
  }

  private static toNumber(ipv4: string): number {
    const octets = ipv4.split('.');
    let result = 0;
    for (let index = 0; index < OCTETS_PER_IPV4; index += 1) {
      result = result * VALUES_PER_OCTET + Number(octets[index]);
    }
    return result;
  }
}
