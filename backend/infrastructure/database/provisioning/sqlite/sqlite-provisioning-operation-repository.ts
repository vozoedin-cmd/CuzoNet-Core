import type { ProvisioningIdempotencyPort } from '../../../../application/ports/provisioning/provisioning-idempotency.port.js';
import type { ProvisioningOperationClaimer } from '../../../../application/ports/provisioning/provisioning-operation-claimer.port.js';
import type { ProvisioningOperationReader } from '../../../../application/ports/provisioning/provisioning-operation-reader.port.js';
import type { ProvisioningOperationRepository } from '../../../../application/ports/provisioning/provisioning-operation-repository.port.js';
import type { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';
import { ProvisioningOperationConflictError } from '../../../../domain/provisioning/errors/provisioning-operation-conflict.error.js';
import type { OperationTypeValue } from '../../../../domain/provisioning/value-objects/operation-type.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import { isSqliteConstraintError } from '../../sqlite/sqlite-error-translator.js';
import { sqliteProvisioningOperationMapper } from './sqlite-provisioning-operation.mapper.js';

export class SqliteProvisioningOperationRepository
  implements
    ProvisioningOperationRepository,
    ProvisioningOperationReader,
    ProvisioningOperationClaimer,
    ProvisioningIdempotencyPort
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(operation: ProvisioningOperation): Promise<void> {
    return this.session.execute(async (database) => {
      try {
        await database
          .insertInto('provisioning_operations')
          .values({
            attempt_count: operation.attemptCount,
            causation_id: operation.causationId,
            company_id: operation.companyId,
            completed_at: operation.completedAt?.toISOString() ?? null,
            correlation_id: operation.correlationId,
            created_at: operation.createdAt.toISOString(),
            id: operation.id.value,
            idempotency_key: operation.idempotencyKey,
            ip_address_id: operation.provisionRequest.ipAddressId ?? null,
            last_error_code: operation.lastErrorCode ?? null,
            last_error_message: operation.lastErrorMessage ?? null,
            max_attempts: operation.maxAttempts,
            next_attempt_at: operation.nextAttemptAt?.toISOString() ?? null,
            operation_type: operation.type.value,
            requested_by: operation.requestedBy,
            router_id: operation.provisionRequest.routerId,
            service_address_id: operation.provisionRequest.serviceAddressId ?? null,
            service_id: operation.serviceId,
            started_at: operation.startedAt?.toISOString() ?? null,
            status: operation.status.value,
          })
          .onConflict((conflict) =>
            conflict.column('id').doUpdateSet({
              attempt_count: operation.attemptCount,
              completed_at: operation.completedAt?.toISOString() ?? null,
              last_error_code: operation.lastErrorCode ?? null,
              last_error_message: operation.lastErrorMessage ?? null,
              next_attempt_at: operation.nextAttemptAt?.toISOString() ?? null,
              started_at: operation.startedAt?.toISOString() ?? null,
              status: operation.status.value,
            }),
          )
          .execute();
      } catch (error) {
        if (isSqliteConstraintError(error)) throw new ProvisioningOperationConflictError();
        throw error;
      }
    });
  }

  public findById(
    companyId: string,
    operationId: string,
  ): Promise<ProvisioningOperation | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('provisioning_operations')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', operationId)
        .executeTakeFirst();
      return row === undefined ? null : sqliteProvisioningOperationMapper.toDomain(row);
    });
  }

  public findByIdempotencyKey(
    companyId: string,
    serviceId: string,
    idempotencyKey: string,
  ): Promise<ProvisioningOperation | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('provisioning_operations')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('service_id', '=', serviceId)
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();
      return row === undefined ? null : sqliteProvisioningOperationMapper.toDomain(row);
    });
  }

  public hasNonTerminal(
    companyId: string,
    serviceId: string,
    type: OperationTypeValue,
  ): Promise<boolean> {
    return this.session.execute(async (database) =>
      Boolean(
        await database
          .selectFrom('provisioning_operations')
          .select('id')
          .where('company_id', '=', companyId)
          .where('service_id', '=', serviceId)
          .where('operation_type', '=', type)
          .where('status', 'in', ['queued', 'running', 'failed'])
          .executeTakeFirst(),
      ),
    );
  }

  public claimNext(companyId: string, at: Date): Promise<ProvisioningOperation | null> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        const row = await database
          .selectFrom('provisioning_operations')
          .selectAll()
          .where('company_id', '=', companyId)
          .where('status', '=', 'queued')
          .where((expression) =>
            expression.or([
              expression('next_attempt_at', 'is', null),
              expression('next_attempt_at', '<=', at.toISOString()),
            ]),
          )
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .limit(1)
          .executeTakeFirst();
        if (row === undefined) return null;
        const operation = sqliteProvisioningOperationMapper.toDomain(row);
        operation.start(at);
        await this.save(operation);
        return operation;
      }),
    );
  }
}
