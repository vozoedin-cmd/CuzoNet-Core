import { describe, expect, it } from 'vitest';
import {
  parsePaymentListQuery,
  parsePaymentRequest,
} from '../../../../backend/api/billing/validators/billing-request.schemas.js';
describe('Billing request schemas', () => {
  it('acepta el contrato PaymentCreateRequest', () => {
    expect(
      parsePaymentRequest({
        amountCents: 10000,
        clientId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10',
        currencyCode: 'GTQ',
        method: 'cash',
        receivedAt: '2026-07-11T10:00:00.000Z',
      }),
    ).toMatchObject({ amountCents: 10000, method: 'cash' });
  });
  it('rechaza campos desconocidos y montos inválidos', () => {
    expect(() =>
      parsePaymentRequest({
        amountCents: 0,
        clientId: 'bad',
        currencyCode: 'gtq',
        method: 'cash',
        receivedAt: 'bad',
        secret: 'x',
      }),
    ).toThrow();
  });
  it('aplica paginación contractual', () => {
    expect(parsePaymentListQuery({})).toEqual({ page: 1, pageSize: 20 });
  });
});
