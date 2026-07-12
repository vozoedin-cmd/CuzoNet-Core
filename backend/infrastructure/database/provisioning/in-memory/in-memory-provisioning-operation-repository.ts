import type { ProvisioningIdempotencyPort } from '../../../../application/ports/provisioning/provisioning-idempotency.port.js';
import type { ProvisioningOperationClaimer } from '../../../../application/ports/provisioning/provisioning-operation-claimer.port.js';
import type { ProvisioningOperationReader } from '../../../../application/ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../../application/ports/provisioning/provisioning-operation-repository.port.js';
import type { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';
import type { OperationTypeValue } from '../../../../domain/provisioning/value-objects/operation-type.js';
import {
  inMemoryProvisioningOperationMapper,
  type InMemoryProvisioningOperationRecord,
} from './in-memory-provisioning-operation.mapper.js';

const terminalStatuses = new Set(['succeeded', 'cancelled', 'manual_review']);

export class InMemoryProvisioningOperationRepository
  implements
    ProvisioningOperationRepository,
    ProvisioningOperationReader,
    ProvisioningOperationClaimer,
    ProvisioningIdempotencyPort
{
  private readonly records = new Map<string, InMemoryProvisioningOperationRecord>();

  public save(operation: ProvisioningOperation): Promise<void> {
    this.records.set(
      this.key(operation.companyId, operation.id.value),
      inMemoryProvisioningOperationMapper.toRecord(operation),
    );
    return Promise.resolve();
  }

  public findById(companyId: string, operationId: string): Promise<ProvisioningOperation | null> {
    const record = this.records.get(this.key(companyId, operationId));
    return Promise.resolve(
      record === undefined ? null : inMemoryProvisioningOperationMapper.toDomain(record),
    );
  }

  public findByIdempotencyKey(
    companyId: string,
    serviceId: string,
    idempotencyKey: string,
  ): Promise<ProvisioningOperation | null> {
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.companyId === companyId &&
        candidate.serviceId === serviceId &&
        candidate.idempotencyKey === idempotencyKey,
    );
    return Promise.resolve(
      record === undefined ? null : inMemoryProvisioningOperationMapper.toDomain(record),
    );
  }

  public hasNonTerminal(
    companyId: string,
    serviceId: string,
    type: OperationTypeValue,
  ): Promise<boolean> {
    return Promise.resolve(
      [...this.records.values()].some(
        (record) =>
          record.companyId === companyId &&
          record.serviceId === serviceId &&
          record.type === type &&
          !terminalStatuses.has(record.status),
      ),
    );
  }

  public claimNext(companyId: string, at: Date): Promise<ProvisioningOperation | null> {
    const record = [...this.records.values()]
      .filter(
        (candidate) =>
          candidate.companyId === companyId &&
          candidate.status === 'queued' &&
          (candidate.nextAttemptAt === undefined || new Date(candidate.nextAttemptAt) <= at),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (record === undefined) return Promise.resolve(null);
    const operation = inMemoryProvisioningOperationMapper.toDomain(record);
    operation.start(at);
    this.records.set(
      this.key(companyId, operation.id.value),
      inMemoryProvisioningOperationMapper.toRecord(operation),
    );
    return Promise.resolve(operation);
  }

  private key(companyId: string, operationId: string): string {
    return `${companyId}:${operationId}`;
  }
}
