import { isIP } from 'node:net';

import { InvalidEquipmentDataError } from './errors/invalid-equipment-data.error.js';

const maximumHostnameLength = 253;
const maximumHostnameLabelLength = 63;
const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ipv4LikePattern = /^[0-9.]+$/;

export class ManagementHost {
  private constructor(public readonly value: string) {}

  public static create(input: string): ManagementHost {
    const value = input.trim();
    if (value.length === 0) {
      throw invalidHost('No puede estar vacío.');
    }

    const ipVersion = isIP(value);
    if (ipVersion === 4) return new ManagementHost(value);
    if (ipVersion === 6) return new ManagementHost(value.toLowerCase());

    if (hasLocationSyntax(value)) {
      throw invalidHost('Debe ser una dirección IP o un hostname sin protocolo, puerto ni path.');
    }
    if (ipv4LikePattern.test(value) || value.includes(':')) {
      throw invalidHost('La dirección IP no es válida.');
    }

    const hostname = value.toLowerCase();
    if (hostname.length > maximumHostnameLength) {
      throw invalidHost(`El hostname no puede superar ${maximumHostnameLength} caracteres.`);
    }

    const labels = hostname.split('.');
    if (
      labels.some(
        (label) =>
          label.length === 0 ||
          label.length > maximumHostnameLabelLength ||
          !hostnameLabelPattern.test(label),
      )
    ) {
      throw invalidHost('El hostname DNS no es válido.');
    }

    return new ManagementHost(hostname);
  }
}

function hasLocationSyntax(value: string): boolean {
  return (
    value.includes('://') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('@') ||
    value.startsWith('[') ||
    value.endsWith(']')
  );
}

function invalidHost(message: string): InvalidEquipmentDataError {
  return new InvalidEquipmentDataError('managementHost', message);
}
