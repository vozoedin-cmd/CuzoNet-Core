import { describe, expect, it } from 'vitest';

import {
  parseCreateServiceRequest,
  parseServiceIdParams,
} from '../../../../backend/api/services/validators/service-request.schemas.js';

const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22';

describe('Services request validation', () => {
  it('acepta únicamente los campos lógicos de creación', () => {
    expect(
      parseCreateServiceRequest({
        billingDay: 15,
        planVersionId,
        serviceType: 'simple_queue',
      }),
    ).toEqual({ billingDay: 15, planVersionId, serviceType: 'simple_queue' });
  });

  it('rechaza referencias técnicas de Provisioning', () => {
    expect(() =>
      parseCreateServiceRequest({
        billingDay: 15,
        planVersionId,
        routerId: serviceId,
        serviceType: 'simple_queue',
      }),
    ).toThrow('La solicitud contiene datos inválidos.');
  });

  it('valida serviceId como UUID', () => {
    expect(parseServiceIdParams({ serviceId })).toEqual({ serviceId });
    expect(() => parseServiceIdParams({ serviceId: 'invalid' })).toThrow(
      'La solicitud contiene datos inválidos.',
    );
  });
});
