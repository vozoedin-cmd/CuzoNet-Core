import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const PORT_TOKEN = /^(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3})$/;

function isValidToken(token: string): boolean {
  const parts = token.split('-');
  if (parts.length === 1) return PORT_TOKEN.test(parts[0]!);
  if (parts.length === 2) return PORT_TOKEN.test(parts[0]!) && PORT_TOKEN.test(parts[1]!);
  return false;
}

/** RouterOS firewall filter src-port/dst-port: a port, and/or a comma-separated list of ports and ranges (e.g. "80,443,1000-2000"). */
export class PortSpecification {
  private constructor(public readonly value: string) {}

  public static create(raw: string): PortSpecification {
    const value = raw.trim();
    const tokens = value.split(',');
    if (value.length === 0 || tokens.some((token) => !isValidToken(token))) {
      throw new InvalidProvisioningDataError(
        'port',
        'Debe ser un puerto, lista separada por comas y/o rangos válidos (1-65535), p.ej. "80,443,1000-2000".',
      );
    }
    return new PortSpecification(value);
  }
}
