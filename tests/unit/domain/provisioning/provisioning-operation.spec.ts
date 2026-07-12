import { describe, expect, it } from 'vitest';

import { ProvisioningOperation } from '../../../../backend/domain/provisioning/provisioning-operation.js';
import { OperationFailure } from '../../../../backend/domain/provisioning/value-objects/operation-failure.js';
import { OperationId } from '../../../../backend/domain/provisioning/value-objects/operation-id.js';
import { operationStatuses } from '../../../../backend/domain/provisioning/value-objects/operation-status.js';
import { OperationType } from '../../../../backend/domain/provisioning/value-objects/operation-type.js';
import { ProvisionRequest } from '../../../../backend/domain/provisioning/value-objects/provision-request.js';

const operationId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30';
const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const routerId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';

function createOperation(maxAttempts = 3): ProvisioningOperation {
  return ProvisioningOperation.create({
    causationId: 'provision-service-0001',
    companyId: 'company-one',
    correlationId: 'correlation-one',
    createdAt: new Date('2026-07-11T15:00:00.000Z'),
    eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c31',
    id: OperationId.create(operationId),
    idempotencyKey: 'provision-service-0001',
    maxAttempts,
    provisionRequest: ProvisionRequest.create({ routerId }),
    requestedBy: 'actor-one',
    serviceId,
    type: OperationType.provision(),
  });
}

describe('ProvisioningOperation aggregate', () => {
  it('crea queued con ProvisionRequest, maxAttempts y el único evento inicial aprobado', () => {
    const operation = createOperation();
    expect(operation.status.value).toBe('queued');
    expect(operation.maxAttempts).toBe(3);
    expect(operation.attemptCount).toBe(0);
    expect(operation.provisionRequest.routerId).toBe(routerId);
    expect(operation.pullDomainEvents().map((event) => event.eventType)).toEqual([
      'ProvisioningOperationQueued.v1',
    ]);
  });

  it('define exactamente los estados contractuales', () => {
    expect(operationStatuses).toEqual([
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'manual_review',
    ]);
  });

  it('separa código y mensaje de error y emite NetworkOperationFailed.v1 por intento', () => {
    const operation = createOperation();
    operation.pullDomainEvents();
    operation.start(new Date('2026-07-11T15:01:00.000Z'));
    operation.fail({
      eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c32',
      failure: OperationFailure.create(
        'ROUTER_UNREACHABLE',
        'No fue posible contactar el destino.',
      ),
      occurredAt: new Date('2026-07-11T15:02:00.000Z'),
    });
    expect(operation.lastErrorCode).toBe('ROUTER_UNREACHABLE');
    expect(operation.lastErrorMessage).toBe('No fue posible contactar el destino.');
    expect(operation.pullDomainEvents()[0]).toMatchObject({
      eventType: 'NetworkOperationFailed.v1',
    });
  });

  it('trata retry como transición y pasa a manual_review al agotar maxAttempts', () => {
    const operation = createOperation(1);
    operation.start(new Date('2026-07-11T15:01:00.000Z'));
    operation.fail({
      eventId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c32',
      failure: OperationFailure.create('TEMPORARY_FAILURE', 'Fallo temporal.'),
      occurredAt: new Date('2026-07-11T15:02:00.000Z'),
    });
    operation.retry(new Date('2026-07-11T15:03:00.000Z'));
    expect(operation.status.value).toBe('manual_review');
  });
});
