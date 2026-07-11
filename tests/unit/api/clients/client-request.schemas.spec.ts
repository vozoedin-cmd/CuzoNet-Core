import { describe, expect, it } from 'vitest';

import {
  parseCreateClientRequest,
  parseIdempotencyKey,
  parseListClientsQuery,
} from '../../../../backend/api/clients/validators/client-request.schemas.js';

describe('Clients request validation', () => {
  it('aplica los valores de paginación definidos en OpenAPI', () => {
    expect(parseListClientsQuery({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('rechaza propiedades adicionales en la creación', () => {
    expect(() =>
      parseCreateClientRequest({
        clientType: 'person',
        documentNumber: '1234567890101',
        documentType: 'dpi',
        legalName: 'Ana López',
        unexpected: true,
      }),
    ).toThrow('La solicitud contiene datos inválidos.');
  });

  it('exige Idempotency-Key con la longitud contractual', () => {
    expect(() => parseIdempotencyKey('short')).toThrow('La solicitud contiene datos inválidos.');
    expect(parseIdempotencyKey('create-client-0001')).toBe('create-client-0001');
  });
});
