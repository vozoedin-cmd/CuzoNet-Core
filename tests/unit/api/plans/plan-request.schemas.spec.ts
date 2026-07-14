import { describe, expect, it } from 'vitest';

import {
  parseCreatePlanRequest,
  parsePlanIdParams,
  parseRevisePlanRequest,
} from '../../../../backend/api/plans/validators/plan-request.schemas.js';

describe('Plan request schemas', () => {
  it('acepta el contrato inicial con upload y download', () => {
    expect(
      parseCreatePlanRequest({
        code: 'HOME_20',
        downloadKbps: 20_000,
        name: 'Hogar 20 Mbps',
        priceCents: 25_000,
        serviceType: 'simple_queue',
        uploadKbps: 10_000,
      }),
    ).toMatchObject({ serviceType: 'simple_queue' });
  });

  it('no publica aun los campos extensibles del perfil', () => {
    expect(() =>
      parseCreatePlanRequest({
        burstUploadKbps: 30_000,
        code: 'HOME_20',
        downloadKbps: 20_000,
        name: 'Hogar 20 Mbps',
        priceCents: 25_000,
        serviceType: 'simple_queue',
        uploadKbps: 10_000,
      }),
    ).toThrow();
  });

  it('requiere UUIDv7 para planId y fecha para revision', () => {
    expect(parsePlanIdParams({ planId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40' })).toBeDefined();
    expect(() => parsePlanIdParams({ planId: '550e8400-e29b-41d4-a716-446655440000' })).toThrow();
    expect(
      parseRevisePlanRequest({
        downloadKbps: 30_000,
        effectiveFrom: '2026-08-01',
        priceCents: 30_000,
        uploadKbps: 15_000,
      }),
    ).toBeDefined();
  });
});
