import { describe, expect, it } from 'vitest';

import { InvalidEquipmentDataError } from '../../../../backend/domain/inventory/errors/invalid-equipment-data.error.js';
import { ManagementHost } from '../../../../backend/domain/inventory/management-host.js';

describe('ManagementHost', () => {
  it.each([
    ['IPv4', '192.0.2.10', '192.0.2.10'],
    ['IPv6', ' 2001:DB8::A ', '2001:db8::a'],
    ['hostname DNS', ' Router-01.EXAMPLE.COM ', 'router-01.example.com'],
  ])('acepta y normaliza %s', (_kind, input, expected) => {
    expect(ManagementHost.create(input).value).toBe(expected);
  });

  it.each([
    ['vacío', '   '],
    ['URL completa', 'https://router.example.com'],
    ['protocolo', 'ssh://router.example.com'],
    ['path', 'router.example.com/admin'],
    ['puerto', 'router.example.com:8080'],
    ['IPv4 inválida', '999.10.10.10'],
    ['IPv6 inválida', '2001:db8:::1'],
    ['hostname con carácter inválido', 'router_name.example.com'],
    ['hostname con label inválido', '-router.example.com'],
    [
      'hostname excesivamente largo',
      `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}`,
    ],
  ])('rechaza %s', (_kind, input) => {
    expect(() => ManagementHost.create(input)).toThrow(InvalidEquipmentDataError);
  });
});
